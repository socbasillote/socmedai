import type { Request } from "express";

import { env } from "../../config/env.js";

export class FacebookOriginValidationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);

    this.name = "FacebookOriginValidationError";
  }
}

/**
 * Validates the Origin header for state-changing
 * Facebook OAuth session operations.
 *
 * This is an additional CSRF defense.
 *
 * It does not replace:
 * - Supabase authentication
 * - Workspace authorization
 * - OAuth session ownership validation
 */
export function validateFacebookRequestOrigin(req: Request): void {
  const requestOrigin = req.headers.origin;

  // Require an Origin header for browser-originated
  // state-changing Facebook OAuth requests.
  if (typeof requestOrigin !== "string" || !requestOrigin.trim()) {
    throw new FacebookOriginValidationError("Request origin is required.", 403);
  }

  let allowedOrigin: string;

  try {
    allowedOrigin = new URL(env.WEB_ORIGIN).origin;
  } catch {
    throw new FacebookOriginValidationError(
      "Facebook request origin validation is unavailable.",
      503,
    );
  }

  // Reject malformed Origin values.
  let parsedRequestOrigin: URL;

  try {
    parsedRequestOrigin = new URL(requestOrigin);
  } catch {
    throw new FacebookOriginValidationError("Invalid request origin.", 403);
  }

  // An Origin header must identify an origin,
  // not an arbitrary URL containing a path,
  // query string, or fragment.
  if (
    parsedRequestOrigin.origin === "null" ||
    parsedRequestOrigin.origin !== requestOrigin ||
    parsedRequestOrigin.username ||
    parsedRequestOrigin.password
  ) {
    throw new FacebookOriginValidationError("Invalid request origin.", 403);
  }

  // Require an exact match with Storm's frontend origin.
  //
  // Do not use startsWith() or includes(), because
  // those checks can accept attacker-controlled domains.
  if (parsedRequestOrigin.origin !== allowedOrigin) {
    throw new FacebookOriginValidationError(
      "Request origin is not allowed.",
      403,
    );
  }
}
