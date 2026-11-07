import type { RequestHandler } from "express";

import { imageGenerationCommandSchema } from "../schemas/imageGenerationCommandSchema.js";

import { getImageGenerationConfig } from "../config/imageGenerationConfig.js";

import { createImageProvider } from "../services/media/providers/imageProviderFactory.js";

import { submitImageGeneration } from "../services/imageGenerationOrchestrationService.js";

import {
  getImageGenerationCredits,
  getImageGenerationStatus,
} from "../services/imageGenerationApiQueryService.js";

import { getPrivateImageBucket } from "../services/media/supabaseImageStorage.js";

import type { AuthenticatedUser } from "../services/userProfileService.js";

import { createPrivateImageAccessUrl } from "../services/media/mediaImageAccessService.js";

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
 * HTTP generation is explicitly opt-in and
 * mock-only for this checkpoint.
 *
 * A production deployment must not enable
 * this development-only synchronous route.
 */
function assertMockHttpEnabled(): void {
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
}

export const generateWorkspaceImageController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const config = getImageGenerationConfig();

    assertMockHttpEnabled();

    if (config.IMAGE_GENERATION_PROVIDER !== "mock") {
      res.status(503).json({
        error: "Live image generation is unavailable.",
      });
      return;
    }

    const parsed = imageGenerationCommandSchema.safeParse({
      workspaceId: routeParam(req.params.workspaceId),
      idempotencyKey: req.body?.idempotencyKey,
      image: req.body?.image,
    });

    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid image generation request.",
      });
      return;
    }

    // Strictly reject unexpected body fields.
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

    const provider = createImageProvider(config);

    const generated = await submitImageGeneration({
      authUser: res.locals.authUser as AuthenticatedUser,
      command: parsed.data,
      config,
      provider,
      bucket: getPrivateImageBucket(),
    });

    // Explicit public DTO:
    // never spread the internal result.
    res.status(generated.created ? 201 : 200).json({
      assetId: generated.assetId,
      status: generated.status,
      created: generated.created,
      creditsChargedNow: generated.creditsChargedNow,
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
