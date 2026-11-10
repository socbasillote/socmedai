import {
  imageGenerationCommandSchema,
  type ImageGenerationCommand,
} from "../schemas/imageGenerationCommandSchema.js";

import type { AuthenticatedUser } from "./userProfileService.js";

import type { ImageGenerationConfig } from "../config/imageGenerationConfig.js";

import { admitImageGeneration } from "./imageGenerationAdmissionService.js";

import { MockImageProvider } from "./media/providers/mockImageProvider.js";
import { IMAGE_CREDIT_COST } from "./imageGenerationAdmissionService.js";
import { parseLiveImageGateConfig } from "./imageGenerationLiveGate.js";
import { evaluateLiveAdmissionReadiness } from "./imageGenerationLiveAdmissionReadiness.js";

export class ImageGenerationQueueError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "ImageGenerationQueueError";
  }
}

type EnqueueInput = {
  authUser: AuthenticatedUser;
  command: ImageGenerationCommand;
  config: ImageGenerationConfig;
};

export type EnqueuedImageGeneration = {
  assetId: string;
  status: "pending" | "ready" | "failed";
  created: boolean;
  creditsChargedNow: number;
};

/**
 * Accept one image generation request.
 *
 * This service:
 * - validates the command
 * - enforces the mock-only release gate
 * - performs atomic credit-aware admission
 * - returns the persisted asset
 *
 * It never calls an image provider.
 */
export async function enqueueImageGeneration(
  input: EnqueueInput,
): Promise<EnqueuedImageGeneration> {
  const parsed = imageGenerationCommandSchema.safeParse(input.command);

  if (!parsed.success) {
    throw new ImageGenerationQueueError(
      "Invalid image generation command.",
      400,
    );
  }

  /**
   * Phase 12.3.1 is mock-only.
   *
   * Even if a developer enables the live
   * feature flag, paid provider execution
   * is unavailable through this service.
   */
  // Trust only backend configuration; never accept provider/model
  // selection from the HTTP command.
  let generation: { provider: string; model: string };
  let policy: { dailyLimit: number; maxActive: number };

  if (input.config.IMAGE_GENERATION_PROVIDER === "mock") {
    const provider = new MockImageProvider();
    generation = { provider: provider.provider, model: provider.model };
    policy = {
      dailyLimit: input.config.IMAGE_GENERATION_DAILY_WORKSPACE_LIMIT,
      maxActive: input.config.IMAGE_GENERATION_MAX_ACTIVE_WORKSPACE,
    };
  } else {
    // Paid jobs remain blocked while LIVE_PAID_WORKER_ARMED=false.
    // Readiness rejects nonallowlisted workspaces and billing mismatches.
    const liveConfig = parseLiveImageGateConfig(process.env);
    const readiness = evaluateLiveAdmissionReadiness(
      liveConfig,
      parsed.data.workspaceId,
    );

    if (!readiness.ready || readiness.creditCost !== IMAGE_CREDIT_COST) {
      throw new ImageGenerationQueueError(
        "Live image generation is not enabled.",
        503,
      );
    }

    generation = { provider: readiness.provider, model: readiness.model };
    policy = {
      dailyLimit: Math.min(
        readiness.dailyLimit,
        input.config.IMAGE_GENERATION_DAILY_WORKSPACE_LIMIT,
      ),
      maxActive: Math.min(
        readiness.maxActive,
        input.config.IMAGE_GENERATION_MAX_ACTIVE_WORKSPACE,
      ),
    };
  }

  const admitted = await admitImageGeneration({
    authUser: input.authUser,
    workspaceId: parsed.data.workspaceId,
    idempotencyKey: parsed.data.idempotencyKey,
    image: parsed.data.image,

    generation,

    policy,
  });

  const status = admitted.asset.status;

  if (status !== "pending" && status !== "ready" && status !== "failed") {
    throw new ImageGenerationQueueError(
      "Unexpected image generation status.",
      500,
    );
  }

  return {
    assetId: String(admitted.asset._id),
    status,
    created: admitted.created,
    creditsChargedNow: admitted.creditsChargedNow,
  };
}
