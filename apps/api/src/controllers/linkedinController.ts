import type { Request, RequestHandler, Response } from "express";
import { z } from "zod";

import { env } from "../config/env.js";
import type { AuthenticatedUser } from "../services/userProfileService.js";
import { createLinkedInAuthorizationUrl } from "../services/linkedin/linkedinAuthorizationService.js";
import { consumeLinkedInOAuthState } from "../services/linkedin/linkedinOAuthStateService.js";
import { completeLinkedInOAuthCallback } from "../services/linkedin/linkedinCallbackService.js";
import { LinkedInAuthorizationError } from "../services/linkedin/linkedinAuthorizationService.js";
import { getLinkedInConnectionStatus } from "../services/linkedin/linkedinConnectionStatusService.js";
import {
  LinkedInConnectionError,
  disconnectLinkedInConnection,
} from "../services/linkedin/linkedinConnectionService.js";

const connectBodySchema = z.object({
  workspaceId: z.string().trim().min(1),
});

function frontendRedirect(
  res: Parameters<RequestHandler>[1],
  status: "connected" | "error",
  reason?: "denied" | "failed",
) {
  const destination = new URL("/", env.WEB_ORIGIN);

  destination.searchParams.set("linkedin", status);

  if (reason) {
    destination.searchParams.set("reason", reason);
  }

  return res.redirect(302, destination.toString());
}

export const startLinkedInConnect: RequestHandler = async (req, res, next) => {
  try {
    const parsed = connectBodySchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: "A valid workspaceId is required." });
      return;
    }

    const authUser = res.locals.authUser as AuthenticatedUser;
    const authorizationUrl = await createLinkedInAuthorizationUrl(
      authUser,
      parsed.data.workspaceId,
    );

    res.status(200).json({ authorizationUrl });
  } catch (error) {
    if (error instanceof LinkedInAuthorizationError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }

    next(error);
  }
};

export const linkedInOAuthCallback: RequestHandler = async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const providerError =
    typeof req.query.error === "string" ? req.query.error : "";

  if (providerError) {
    // Consume state even when the user denies authorization, preventing replay.
    try {
      await consumeLinkedInOAuthState({ state });
    } catch {
      // Redirect with a generic failure; do not expose state or provider details.
    }

    frontendRedirect(res, "error", "denied");
    return;
  }

  if (!code || !state) {
    frontendRedirect(res, "error", "failed");
    return;
  }

  try {
    await completeLinkedInOAuthCallback({ code, state });
    frontendRedirect(res, "connected");
  } catch {
    // Do not expose authorization codes, state, tokens, or provider error details.
    frontendRedirect(res, "error", "failed");
  }
};

export const getLinkedInStatus: RequestHandler = async (req, res, next) => {
  try {
    const workspaceId =
      typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";

    const authUser = res.locals.authUser as AuthenticatedUser;

    const status = await getLinkedInConnectionStatus(authUser, workspaceId);

    res.status(200).json(status);
  } catch (error) {
    if (error instanceof LinkedInConnectionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }

    next(error);
  }
};

export async function disconnectLinkedIn(req: Request, res: Response) {
  try {
    const authUser = res.locals.authUser as AuthenticatedUser | undefined;
    const workspaceId =
      typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
    const connectionId = req.params.connectionId;

    if (!authUser) {
      return res.status(401).json({
        error: "Authentication is required.",
      });
    }

    if (!connectionId || typeof connectionId !== "string") {
      return res.status(404).json({
        error: "LinkedIn connection not found.",
      });
    }

    const result = await disconnectLinkedInConnection({
      authUser,
      workspaceId,
      connectionId,
    });

    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof LinkedInConnectionError) {
      return res.status(error.statusCode).json({
        error: error.message,
      });
    }

    return res.status(500).json({
      error: "Failed to disconnect LinkedIn.",
    });
  }
}
