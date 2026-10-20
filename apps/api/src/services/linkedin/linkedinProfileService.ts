import { z } from "zod";

export class LinkedInProfileLookupError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "LinkedInProfileLookupError";
  }
}

const linkedInUserInfoSchema = z.object({
  sub: z.string().trim().min(1),
  name: z.string().trim().min(1).optional(),
  picture: z.string().url().optional(),
});

export type LinkedInProfileDetails = {
  memberId: string;
  displayName?: string;
  profilePictureUrl?: string;
};

export async function fetchLinkedInProfile(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LinkedInProfileDetails> {
  if (typeof accessToken !== "string" || !accessToken.trim()) {
    throw new LinkedInProfileLookupError(
      "A LinkedIn access token is required.",
      400,
    );
  }

  let response: Response;

  try {
    response = await fetchImpl("https://api.linkedin.com/v2/userinfo", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    throw new LinkedInProfileLookupError(
      "Unable to contact LinkedIn's profile service.",
      502,
    );
  }

  if (!response.ok) {
    throw new LinkedInProfileLookupError(
      "LinkedIn could not verify the connected profile.",
      502,
    );
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new LinkedInProfileLookupError(
      "LinkedIn returned an invalid profile response.",
      502,
    );
  }

  const parsed = linkedInUserInfoSchema.safeParse(payload);

  if (!parsed.success) {
    throw new LinkedInProfileLookupError(
      "LinkedIn returned an invalid profile response.",
      502,
    );
  }

  return {
    memberId: parsed.data.sub,
    ...(parsed.data.name ? { displayName: parsed.data.name } : {}),
    ...(parsed.data.picture ? { profilePictureUrl: parsed.data.picture } : {}),
  };
}
