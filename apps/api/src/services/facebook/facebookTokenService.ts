import { z } from "zod";

import { env } from "../../config/env.js";

import {
  getFacebookOAuthConfig,
  FacebookConfigurationError,
} from "./facebookConfig.js";

const facebookTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_in: z.number().int().positive().optional(),
});

export type FacebookTokenResponse = z.infer<typeof facebookTokenResponseSchema>;

export class FacebookTokenExchangeError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "FacebookTokenExchangeError";
  }
}

export async function exchangeFacebookAuthorizationCode(
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FacebookTokenResponse> {
  if (typeof code !== "string" || !code.trim()) {
    throw new FacebookTokenExchangeError(
      "A Facebook authorization code is required.",
      400,
    );
  }

  let config: ReturnType<typeof getFacebookOAuthConfig>;

  try {
    config = getFacebookOAuthConfig();
  } catch (error) {
    if (error instanceof FacebookConfigurationError) {
      throw new FacebookTokenExchangeError(
        "Facebook OAuth is not configured on the server.",
        503,
      );
    }

    throw error;
  }

  const graphApiVersion = env.FACEBOOK_GRAPH_API_VERSION;

  if (!graphApiVersion) {
    throw new FacebookTokenExchangeError(
      "Facebook Graph API version is not configured on the server.",
      503,
    );
  }

  const tokenUrl = new URL(
    `https://graph.facebook.com/${graphApiVersion}/oauth/access_token`,
  );

  tokenUrl.searchParams.set("client_id", config.appId);
  tokenUrl.searchParams.set("client_secret", config.appSecret);
  tokenUrl.searchParams.set("redirect_uri", config.redirectUri);
  tokenUrl.searchParams.set("code", code);

  let response: Response;

  try {
    response = await fetchImpl(tokenUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
  } catch {
    throw new FacebookTokenExchangeError(
      "Unable to contact Facebook's token service.",
      502,
    );
  }

  if (!response.ok) {
    throw new FacebookTokenExchangeError(
      "Facebook rejected the authorization code.",
      502,
    );
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new FacebookTokenExchangeError(
      "Facebook returned an invalid token response.",
      502,
    );
  }

  const parsed = facebookTokenResponseSchema.safeParse(payload);

  if (!parsed.success) {
    throw new FacebookTokenExchangeError(
      "Facebook returned an invalid token response.",
      502,
    );
  }

  return parsed.data;
}
