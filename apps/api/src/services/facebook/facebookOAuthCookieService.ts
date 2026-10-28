import type { CookieOptions, Response } from "express";

import { env } from "../../config/env.js";

export const FACEBOOK_OAUTH_COOKIE_NAME = "storm_fb_oauth_session";

export const FACEBOOK_OAUTH_COOKIE_MAX_AGE_MS = 10 * 60 * 1000;

export const FACEBOOK_OAUTH_COOKIE_PATH = "/api/facebook";

export class FacebookOAuthCookieError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FacebookOAuthCookieError";
  }
}

function getFacebookOAuthCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: FACEBOOK_OAUTH_COOKIE_PATH,
  };
}

export function setFacebookOAuthSessionCookie(
  res: Response,
  sessionToken: string,
): void {
  if (
    typeof sessionToken !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(sessionToken)
  ) {
    throw new FacebookOAuthCookieError("Invalid Facebook OAuth session token.");
  }

  res.cookie(FACEBOOK_OAUTH_COOKIE_NAME, sessionToken, {
    ...getFacebookOAuthCookieOptions(),
    maxAge: FACEBOOK_OAUTH_COOKIE_MAX_AGE_MS,
  });
}

export function clearFacebookOAuthSessionCookie(res: Response): void {
  res.clearCookie(FACEBOOK_OAUTH_COOKIE_NAME, getFacebookOAuthCookieOptions());
}
