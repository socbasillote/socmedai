import type { RequestHandler } from "express";

import { imageGenerationCommandSchema } from "../schemas/imageGenerationCommandSchema.js";

import { getImageGenerationConfig } from "../config/imageGenerationConfig.js";

import { enqueueImageGeneration } from "../services/imageGenerationQueueService.js";

import {
  getImageGenerationCredits,
  getImageGenerationStatus,
} from "../services/imageGenerationApiQueryService.js";

import type { AuthenticatedUser } from "../services/userProfileService.js";

import { createPrivateImageAccessUrl } from "../services/media/mediaImageAccessService.js";

import { parseLiveImageGateConfig } from "../services/imageGenerationLiveGate.js";

import { evaluateLiveAdmissionReadiness } from "../services/imageGenerationLiveAdmissionReadiness.js";

function routeParam(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isStatusError(
  error: unknown,
): error is Error & { statusCode: number } {
  return (
    error instanceof Error &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  );
}

function respondError(
  error: unknown,
  res: Parameters<RequestHandler>[1],
  next: Parameters<RequestHandler>[2],
): void {
  if (!isStatusError(error)) {
    next(error);
    return;
  }

  const status = error.statusCode;

  // Never reflect arbitrary internal service
  // messages in public API responses.
  const message =
    status === 402
      ? "Insufficient image generation credits."
      : status === 429
        ? "Image generation limit reached."
        : status === 404
          ? "Resource not found."
          : status === 409
            ? "Image generation request conflict."
            : status === 400
              ? "Invalid image generation request."
              : status === 503
                ? "Image generation is unavailable."
                : "Image generation request failed.";

  res
    .status(status >= 400 && status <= 599 ? status : 500)
    .json({ error: message });
}

/**
 * HTTP generation remains development-only.
 *
 * Mock generation follows the existing route.
 * OpenAI generation requires the live admission
 * gate and the exact allowlisted workspace.
 */

function assertImageGenerationHttpEnabled(
  provider: "mock" | "openai",
  workspaceId: string,
): void {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.IMAGE_GENERATION_HTTP_ENABLED !== "true"
  ) {
    const error = new Error("Image generation HTTP is disabled.") as Error & {
      statusCode: number;
    };

    error.statusCode = 503;
    throw error;
  }

  if (provider === "openai") {
    const gate = parseLiveImageGateConfig(process.env);

    const readiness = evaluateLiveAdmissionReadiness(gate, workspaceId);

    if (!readiness.ready) {
      const error = new Error(
        "Live image generation is unavailable.",
      ) as Error & { statusCode: number };

      error.statusCode = 503;
      throw error;
    }
  }
}

export const generateWorkspaceImageController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const config = getImageGenerationConfig();

    const workspaceId = routeParam(req.params.workspaceId);

    // Temporary diagnostic for Step 12.3.6.7.
    console.info("[Image HTTP Diagnostic]", {
      provider: config.IMAGE_GENERATION_PROVIDER,
      httpEnabled: process.env.IMAGE_GENERATION_HTTP_ENABLED === "true",
      production: process.env.NODE_ENV === "production",
      workspaceIdMatchesAllowlist: (
        process.env.IMAGE_GENERATION_LIVE_WORKSPACE_ALLOWLIST ?? ""
      )
        .split(",")
        .map((id) => id.trim())
        .includes(workspaceId),
    });

    assertImageGenerationHttpEnabled(
      config.IMAGE_GENERATION_PROVIDER,
      workspaceId,
    );

    // The request body may only contain
    // idempotencyKey and image.
    if (
      !req.body ||
      typeof req.body !== "object" ||
      Array.isArray(req.body) ||
      Object.keys(req.body).some(
        (key) => key !== "idempotencyKey" && key !== "image",
      )
    ) {
      res.status(400).json({
        error: "Invalid image generation request.",
      });
      return;
    }

    const parsed = imageGenerationCommandSchema.safeParse({
      workspaceId: routeParam(req.params.workspaceId),
      idempotencyKey: req.body.idempotencyKey,
      image: req.body.image,
    });

    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid image generation request.",
      });
      return;
    }

    let queued: Awaited<ReturnType<typeof enqueueImageGeneration>>;

    try {
      queued = await enqueueImageGeneration({
        authUser: res.locals.authUser as AuthenticatedUser,
        command: parsed.data,
        config,
      });
    } catch (error) {
      console.error("[Image Admission Diagnostic]", {
        stage: "enqueueImageGeneration",
        errorType:
          error instanceof Error ? error.constructor.name : "UnknownError",
        statusCode: isStatusError(error) ? error.statusCode : undefined,
      });

      throw error;
    }

    // HTTP 202 means the operation has been
    // accepted but is not necessarily complete.
    //
    // Identical retries return HTTP 200.
    res.setHeader("Cache-Control", "no-store");

    res.status(queued.created ? 202 : 200).json({
      assetId: queued.assetId,
      status: queued.status,
      created: queued.created,
      creditsChargedNow: queued.creditsChargedNow,
    });
  } catch (error) {
    respondError(error, res, next);
  }
};

export const getWorkspaceImageController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const response = await getImageGenerationStatus(
      res.locals.authUser as AuthenticatedUser,
      routeParam(req.params.workspaceId),
      routeParam(req.params.assetId),
    );

    res.status(200).json(response);
  } catch (error) {
    respondError(error, res, next);
  }
};

export const getWorkspaceImageCreditsController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const response = await getImageGenerationCredits(
      res.locals.authUser as AuthenticatedUser,
      routeParam(req.params.workspaceId),
      getImageGenerationConfig(),
    );

    res.status(200).json(response);
  } catch (error) {
    respondError(error, res, next);
  }
};

export const getWorkspaceImageUrlController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const response = await createPrivateImageAccessUrl(
      res.locals.authUser as AuthenticatedUser,
      routeParam(req.params.workspaceId),
      routeParam(req.params.assetId),
    );

    // Signed URLs are short-lived credentials.
    // Do not let browsers or proxies cache
    // the API's response.
    res.setHeader("Cache-Control", "no-store");

    res.setHeader("Pragma", "no-cache");

    res.setHeader("Referrer-Policy", "no-referrer");

    res.status(200).json(response);
  } catch (error) {
    respondError(error, res, next);
  }
};
