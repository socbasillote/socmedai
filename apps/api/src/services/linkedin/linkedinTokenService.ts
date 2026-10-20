import { z } from "zod";
import { getLinkedInOAuthConfig } from "./linkedinConfig.js";

const linkedInTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1).optional(),
  refresh_token_expires_in: z.number().int().positive().optional(),
  scope: z.string().optional(),
});

export type LinkedInTokenResponse = z.infer<typeof linkedInTokenResponseSchema>;

export class LinkedInTokenExchangeError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "LinkedInTokenExchangeError";
  }
}

export async function exchangeLinkedInAuthorizationCode(
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LinkedInTokenResponse> {
  if (typeof code !== "string" || !code.trim()) {
    throw new LinkedInTokenExchangeError(
      "A LinkedIn authorization code is required.",
      400,
    );
  }

  let config: ReturnType<typeof getLinkedInOAuthConfig>;

  try {
    config = getLinkedInOAuthConfig();
  } catch {
    throw new LinkedInTokenExchangeError(
      "LinkedIn OAuth is not configured on the server.",
      503,
    );
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
  });

  let response: Response;

  try {
    response = await fetchImpl(
      "https://www.linkedin.com/oauth/v2/accessToken",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );
  } catch {
    throw new LinkedInTokenExchangeError(
      "Unable to contact LinkedIn's token service.",
      502,
    );
  }

  if (!response.ok) {
    throw new LinkedInTokenExchangeError(
      "LinkedIn rejected the authorization code.",
      502,
    );
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new LinkedInTokenExchangeError(
      "LinkedIn returned an invalid token response.",
      502,
    );
  }

  const parsed = linkedInTokenResponseSchema.safeParse(payload);

  if (!parsed.success) {
    throw new LinkedInTokenExchangeError(
      "LinkedIn returned an invalid token response.",
      502,
    );
  }

  return parsed.data;
}
