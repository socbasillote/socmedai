import { env } from "../../config/env.js";

export class FacebookConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FacebookConfigurationError";
  }
}

export type FacebookOAuthConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
};

export function getFacebookOAuthConfig(): FacebookOAuthConfig {
  const appId = env.FACEBOOK_APP_ID;
  const appSecret = env.FACEBOOK_APP_SECRET;
  const redirectUri = env.FACEBOOK_REDIRECT_URI;

  if (!appId || !appSecret || !redirectUri) {
    throw new FacebookConfigurationError(
      "Facebook OAuth is not configured on the server.",
    );
  }

  let parsedRedirectUri: URL;

  try {
    parsedRedirectUri = new URL(redirectUri);
  } catch {
    throw new FacebookConfigurationError(
      "Facebook OAuth redirect URI is invalid.",
    );
  }

  if (
    parsedRedirectUri.protocol !== "https:" &&
    !(
      parsedRedirectUri.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(parsedRedirectUri.hostname)
    )
  ) {
    throw new FacebookConfigurationError(
      "Facebook OAuth redirect URI must use HTTPS, except for localhost development.",
    );
  }

  if (
    parsedRedirectUri.username ||
    parsedRedirectUri.password ||
    parsedRedirectUri.hash
  ) {
    throw new FacebookConfigurationError(
      "Facebook OAuth redirect URI must not contain credentials or a fragment.",
    );
  }

  return {
    appId,
    appSecret,
    redirectUri,
  };
}
