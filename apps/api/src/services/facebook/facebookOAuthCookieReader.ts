import type { Request } from "express";

import { FACEBOOK_OAUTH_COOKIE_NAME } from "./facebookOAuthCookieService.js";

export class FacebookOAuthCookieReaderError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "FacebookOAuthCookieReaderError";
  }
}

const FACEBOOK_SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function readFacebookOAuthSessionCookie(req: Request): string {
  const cookieHeader = req.headers.cookie;

  if (!cookieHeader) {
    throw new FacebookOAuthCookieReaderError(
      "Facebook authorization session is missing.",
      401,
    );
  }

  const cookies = cookieHeader.split(";");

  let sessionToken: string | null = null;

  for (const cookie of cookies) {
    const separatorIndex = cookie.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const name = cookie.slice(0, separatorIndex).trim();

    if (name !== FACEBOOK_OAUTH_COOKIE_NAME) {
      continue;
    }

    // Reject duplicate session cookies rather than choosing one.
    if (sessionToken !== null) {
      throw new FacebookOAuthCookieReaderError(
        "Invalid Facebook authorization session.",
        401,
      );
    }

    const value = cookie.slice(separatorIndex + 1).trim();

    if (!FACEBOOK_SESSION_TOKEN_PATTERN.test(value)) {
      throw new FacebookOAuthCookieReaderError(
        "Invalid Facebook authorization session.",
        401,
      );
    }

    sessionToken = value;
  }

  if (!sessionToken) {
    throw new FacebookOAuthCookieReaderError(
      "Facebook authorization session is missing.",
      401,
    );
  }

  return sessionToken;
}
