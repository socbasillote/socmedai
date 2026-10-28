import type { RequestHandler, Request, Response } from "express";
import { z } from "zod";

import type { AuthenticatedUser } from "../services/userProfileService.js";

import {
  createFacebookAuthorizationUrl,
  FacebookAuthorizationError,
} from "../services/facebook/facebookAuthorizationService.js";

import { env } from "../config/env.js";

import { completeFacebookOAuthCallback } from "../services/facebook/facebookCallbackService.js";

import { consumeFacebookOAuthState } from "../services/facebook/facebookOAuthStateService.js";

import {
  clearFacebookOAuthSessionCookie,
  setFacebookOAuthSessionCookie,
} from "../services/facebook/facebookOAuthCookieService.js";

import mongoose from "mongoose";

import {
  getFacebookOAuthSession,
  FacebookOAuthSessionError,
} from "../services/facebook/facebookOAuthSessionService.js";

import {
  readFacebookOAuthSessionCookie,
  FacebookOAuthCookieReaderError,
} from "../services/facebook/facebookOAuthCookieReader.js";

import {
  connectFacebookPages,
  FacebookPageConnectionError,
} from "../services/facebook/facebookPageConnectionService.js";

import {
  validateFacebookRequestOrigin,
  FacebookOriginValidationError,
} from "../services/facebook/facebookOriginValidationService.js";

const connectBodySchema = z.object({
  workspaceId: z.string().trim().min(1),
});

export const startFacebookConnect: RequestHandler = async (_req, res, next) => {
  try {
    const parsed = connectBodySchema.safeParse(_req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: "A valid workspaceId is required.",
      });
      return;
    }

    const authUser = res.locals.authUser as AuthenticatedUser | undefined;

    if (!authUser) {
      res.status(401).json({
        error: "Authentication is required.",
      });
      return;
    }

    const authorizationUrl = await createFacebookAuthorizationUrl(
      authUser,
      parsed.data.workspaceId,
    );

    res.status(200).json({
      authorizationUrl,
    });
  } catch (error) {
    if (error instanceof FacebookAuthorizationError) {
      res.status(error.statusCode).json({
        error: error.message,
      });
      return;
    }

    next(error);
  }
};

const FACEBOOK_CALLBACK_REDIRECT_PATH = "/";

function buildFacebookCallbackRedirect(
  status: "connected" | "error",
  reason?: "denied" | "failed",
): string {
  const redirectUrl = new URL(FACEBOOK_CALLBACK_REDIRECT_PATH, env.WEB_ORIGIN);

  redirectUrl.searchParams.set("facebook", status);

  if (reason) {
    redirectUrl.searchParams.set("reason", reason);
  }

  return redirectUrl.toString();
}

function getSingleQueryValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
}

export async function facebookOAuthCallback(
  req: Request,
  res: Response,
): Promise<void> {
  // Do not allow a stale Page-selection cookie to survive a new callback.
  clearFacebookOAuthSessionCookie(res);

  const state = getSingleQueryValue(req.query.state);
  const code = getSingleQueryValue(req.query.code);
  const providerError = getSingleQueryValue(req.query.error);

  // Facebook authorization was denied or failed at the provider.
  if (providerError) {
    if (state) {
      try {
        // Invalidate the state even when Facebook reports a denial.
        await consumeFacebookOAuthState({ state });
      } catch {
        // The state may already be expired, invalid, or consumed.
        // Never expose state validation details to the browser.
      }
    }

    res.redirect(302, buildFacebookCallbackRedirect("error", "denied"));

    return;
  }

  // Missing or malformed callback parameters.
  if (!state || !code) {
    res.redirect(302, buildFacebookCallbackRedirect("error", "failed"));

    return;
  }

  try {
    const session = await completeFacebookOAuthCallback({
      code,
      state,
    });

    setFacebookOAuthSessionCookie(res, session.sessionToken);

    res.redirect(302, buildFacebookCallbackRedirect("connected"));
  } catch {
    clearFacebookOAuthSessionCookie(res);

    res.redirect(302, buildFacebookCallbackRedirect("error", "failed"));
  }
}

export async function getFacebookOAuthSessionController(
  req: Request,
  res: Response,
): Promise<void> {
  // Authentication is enforced by requireAuth in the route.
  const authUser = res.locals.authUser;

  if (!authUser || typeof authUser.id !== "string" || !authUser.id.trim()) {
    res.status(401).json({
      message: "Authentication is required.",
    });

    return;
  }

  // Read and validate the requested workspace.
  const workspaceId = req.query.workspaceId;

  if (
    typeof workspaceId !== "string" ||
    !mongoose.isValidObjectId(workspaceId)
  ) {
    res.status(400).json({
      message: "A valid workspace is required.",
    });

    return;
  }

  try {
    // Extract the temporary session token from the HTTP-only cookie.
    const sessionToken = readFacebookOAuthSessionCookie(req);

    // The service verifies:
    // - Authenticated user ownership
    // - Workspace access
    // - Session ownership
    // - Workspace binding
    // - Session expiration
    const session = await getFacebookOAuthSession({
      sessionToken,
      authUser,
      workspaceId,
    });

    // Return only safe Page metadata.
    // Never return the session token or Facebook access tokens.
    res.status(200).json({
      workspaceId,
      expiresAt: session.expiresAt,
      pages: session.pages,
    });
  } catch (error) {
    if (error instanceof FacebookOAuthCookieReaderError) {
      res.status(error.statusCode).json({
        message: error.message,
      });

      return;
    }

    if (error instanceof FacebookOAuthSessionError) {
      res.status(error.statusCode).json({
        message: error.message,
      });

      return;
    }

    // Do not expose internal errors or sensitive provider data.
    res.status(500).json({
      message: "Unable to retrieve Facebook authorization session.",
    });
  }
}

/**
 * POST /api/facebook/pages/connect
 *
 * Permanently connects selected Facebook Pages
 * to an authenticated Storm workspace.
 *
 * Security:
 * - Requires Supabase authentication at the route level.
 * - Validates the request Origin.
 * - Requires a valid temporary OAuth session cookie.
 * - Verifies workspace ownership in the service.
 * - Verifies OAuth session ownership in the service.
 * - Requires CREATE_CONTENT permission for each Page.
 * - Consumes the OAuth session transactionally.
 * - Never exposes Facebook access tokens.
 */
export async function connectFacebookPagesController(
  req: Request,
  res: Response,
): Promise<void> {
  // 1. Require an authenticated Storm user.
  const authUser = res.locals.authUser;

  if (!authUser || typeof authUser.id !== "string" || !authUser.id.trim()) {
    res.status(401).json({
      message: "Authentication is required.",
    });

    return;
  }

  // 2. Validate the request Origin before processing
  // the OAuth session or performing database writes.
  try {
    validateFacebookRequestOrigin(req);
  } catch (error) {
    if (error instanceof FacebookOriginValidationError) {
      res.status(error.statusCode).json({
        message: error.message,
      });

      return;
    }

    res.status(500).json({
      message: "Unable to validate Facebook request origin.",
    });

    return;
  }

  // 3. Validate the request body.
  //
  // Do not coerce Page IDs into numbers.
  // Facebook identifiers must remain strings.
  const body = req.body;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    res.status(400).json({
      message: "A valid request body is required.",
    });

    return;
  }

  const { workspaceId, facebookPageIds } = body;

  if (
    typeof workspaceId !== "string" ||
    !mongoose.isValidObjectId(workspaceId)
  ) {
    res.status(400).json({
      message: "A valid workspace is required.",
    });

    return;
  }

  if (
    !Array.isArray(facebookPageIds) ||
    facebookPageIds.length === 0 ||
    facebookPageIds.length > 100 ||
    facebookPageIds.some(
      (pageId: unknown) =>
        typeof pageId !== "string" || !/^[0-9]+$/.test(pageId),
    )
  ) {
    res.status(400).json({
      message: "Select between 1 and 100 valid Facebook Pages.",
    });

    return;
  }

  if (new Set(facebookPageIds).size !== facebookPageIds.length) {
    res.status(400).json({
      message: "Duplicate Facebook Pages are not allowed.",
    });

    return;
  }

  // 4. Read the HTTP-only temporary OAuth session cookie.
  let sessionToken: string;

  try {
    sessionToken = readFacebookOAuthSessionCookie(req);
  } catch (error) {
    if (error instanceof FacebookOAuthCookieReaderError) {
      res.status(error.statusCode).json({
        message: error.message,
      });

      return;
    }

    res.status(500).json({
      message: "Unable to read Facebook authorization session.",
    });

    return;
  }

  // 5. Connect the selected Pages using the existing
  // transaction-safe connection service.
  try {
    const result = await connectFacebookPages({
      sessionToken,
      authUser,
      workspaceId,
      selectedPageIds: facebookPageIds,
    });

    // 6. The transaction has committed successfully.
    //
    // Clear the temporary OAuth session cookie because
    // the session has now been consumed.
    clearFacebookOAuthSessionCookie(res);

    // 7. Return safe connection metadata only.
    res.status(200).json({
      connections: result.connections,
    });
  } catch (error) {
    if (error instanceof FacebookPageConnectionError) {
      res.status(error.statusCode).json({
        message: error.message,
      });

      return;
    }

    // Never expose database errors, OAuth tokens,
    // encryption details, or internal stack traces.
    res.status(500).json({
      message: "Unable to connect Facebook Pages.",
    });
  }
}
