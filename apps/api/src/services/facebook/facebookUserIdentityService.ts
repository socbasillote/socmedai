import { z } from "zod";

import { env } from "../../config/env.js";

const facebookUserIdentitySchema = z.object({
  id: z.string().min(1),
});

export type FacebookUserIdentity = {
  facebookUserId: string;
};

export class FacebookUserIdentityError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "FacebookUserIdentityError";
  }
}

export async function getFacebookUserIdentity(
  userAccessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FacebookUserIdentity> {
  // 1. Validate the user access token.
  if (typeof userAccessToken !== "string" || !userAccessToken.trim()) {
    throw new FacebookUserIdentityError(
      "A Facebook user access token is required.",
      400,
    );
  }

  // 2. Validate the configured Graph API version.
  const graphApiVersion = env.FACEBOOK_GRAPH_API_VERSION;

  if (!graphApiVersion) {
    throw new FacebookUserIdentityError(
      "Facebook Graph API version is not configured.",
      503,
    );
  }

  // 3. Construct the identity endpoint.
  const url = new URL(`https://graph.facebook.com/${graphApiVersion}/me`);

  url.searchParams.set("fields", "id");

  // 4. Request the Facebook user identity.
  let response: Response;

  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${userAccessToken}`,
      },
    });
  } catch {
    throw new FacebookUserIdentityError(
      "Unable to contact Facebook's identity service.",
      502,
    );
  }

  // 5. Handle Facebook API errors.
  if (!response.ok) {
    throw new FacebookUserIdentityError(
      "Facebook rejected the identity request.",
      502,
    );
  }

  // 6. Parse the response safely.
  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new FacebookUserIdentityError(
      "Facebook returned an invalid identity response.",
      502,
    );
  }

  const parsed = facebookUserIdentitySchema.safeParse(payload);

  if (!parsed.success) {
    throw new FacebookUserIdentityError(
      "Facebook returned an invalid identity response.",
      502,
    );
  }

  // 7. Return only the Facebook user ID.
  return {
    facebookUserId: parsed.data.id,
  };
}
