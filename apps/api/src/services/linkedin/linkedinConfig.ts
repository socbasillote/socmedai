import { env } from "../../config/env.js";

export class LinkedInConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LinkedInConfigurationError";
  }
}

export function getLinkedInOAuthConfig() {
  const { LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, LINKEDIN_REDIRECT_URI } =
    env;

  if (
    !LINKEDIN_CLIENT_ID ||
    !LINKEDIN_CLIENT_SECRET ||
    !LINKEDIN_REDIRECT_URI
  ) {
    throw new LinkedInConfigurationError(
      "LinkedIn OAuth is not configured on the server.",
    );
  }

  return {
    clientId: LINKEDIN_CLIENT_ID,
    clientSecret: LINKEDIN_CLIENT_SECRET,
    redirectUri: LINKEDIN_REDIRECT_URI,
  };
}
