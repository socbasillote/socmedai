import { z } from "zod";

import { env } from "../../config/env.js";

import {
  getFacebookOAuthConfig,
  FacebookConfigurationError,
} from "./facebookConfig.js";

const facebookLongLivedTokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_in: z.number().int().positive().optional(),
});

export type FacebookLongLivedTokenResponse = z.infer<
  typeof facebookLongLivedTokenSchema
>;

export class FacebookLongLivedTokenError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "FacebookLongLivedTokenError";
  }
}

export async function exchangeFacebookLongLivedToken(
  shortLivedAccessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FacebookLongLivedTokenResponse> {
  // Step 1: Validate the incoming token.
  if (
    typeof shortLivedAccessToken !== "string" ||
    !shortLivedAccessToken.trim()
  ) {
    throw new FacebookLongLivedTokenError(
      "A Facebook user access token is required.",
      400,
    );
  }

  // Step 2: Validate Facebook OAuth configuration.
  let config: ReturnType<typeof getFacebookOAuthConfig>;

  try {
    config = getFacebookOAuthConfig();
  } catch (error) {
    if (error instanceof FacebookConfigurationError) {
      throw new FacebookLongLivedTokenError(
        "Facebook OAuth is not configured on the server.",
        503,
      );
    }

    throw error;
  }

  // Step 3: Validate the Graph API version.
  const graphApiVersion = env.FACEBOOK_GRAPH_API_VERSION;

  if (!graphApiVersion) {
    throw new FacebookLongLivedTokenError(
      "Facebook Graph API version is not configured on the server.",
      503,
    );
  }

  // Step 4: Construct the token exchange URL.
  const tokenUrl = new URL(
    `https://graph.facebook.com/${graphApiVersion}/oauth/access_token`,
  );

  tokenUrl.searchParams.set("grant_type", "fb_exchange_token");

  tokenUrl.searchParams.set("client_id", config.appId);

  tokenUrl.searchParams.set("client_secret", config.appSecret);

  tokenUrl.searchParams.set("fb_exchange_token", shortLivedAccessToken);

  // Step 5: Request the long-lived token.
  let response: Response;

  try {
    response = await fetchImpl(tokenUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
  } catch {
    throw new FacebookLongLivedTokenError(
      "Unable to contact Facebook's token service.",
      502,
    );
  }

  // Step 6: Handle Meta API errors.
  if (!response.ok) {
    throw new FacebookLongLivedTokenError(
      "Facebook rejected the user token exchange.",
      502,
    );
  }

  // Step 7: Parse the response.
  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new FacebookLongLivedTokenError(
      "Facebook returned an invalid long-lived token response.",
      502,
    );
  }

  // Step 8: Validate the response.
  const parsed = facebookLongLivedTokenSchema.safeParse(payload);

  if (!parsed.success) {
    throw new FacebookLongLivedTokenError(
      "Facebook returned an invalid long-lived token response.",
      502,
    );
  }

  return parsed.data;
}
