import {
  imageGenerationCommandSchema,
  type ImageGenerationCommand,
} from "../schemas/imageGenerationCommandSchema.js";

import type { AuthenticatedUser } from "./userProfileService.js";

import type { ImageGenerationConfig } from "../config/imageGenerationConfig.js";

import { admitImageGeneration } from "./imageGenerationAdmissionService.js";

import { MockImageProvider } from "./media/providers/mockImageProvider.js";

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
  if (input.config.IMAGE_GENERATION_PROVIDER !== "mock") {
    throw new ImageGenerationQueueError(
      "Live image generation is not enabled.",
      503,
    );
  }

  /**
   * Provider identity comes from trusted
   * backend code, never the HTTP body.
   *
   * Creating this provider does not generate
   * an image or contact an external service.
   */
  const provider = new MockImageProvider();

  const admitted = await admitImageGeneration({
    authUser: input.authUser,
    workspaceId: parsed.data.workspaceId,
    idempotencyKey: parsed.data.idempotencyKey,
    image: parsed.data.image,

    generation: {
      provider: provider.provider,
      model: provider.model,
    },

    policy: {
      dailyLimit: input.config.IMAGE_GENERATION_DAILY_WORKSPACE_LIMIT,

      maxActive: input.config.IMAGE_GENERATION_MAX_ACTIVE_WORKSPACE,
    },
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
