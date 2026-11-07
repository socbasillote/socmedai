import MediaAsset from "../models/MediaAsset.js";

import type { AuthenticatedUser } from "./userProfileService.js";

import type { ImageGenerationCommand } from "../schemas/imageGenerationCommandSchema.js";

import { imageGenerationCommandSchema } from "../schemas/imageGenerationCommandSchema.js";

import type { ImageGenerationConfig } from "../config/imageGenerationConfig.js";

import {
  admitImageGeneration,
  releaseImageGenerationCapacity,
} from "./imageGenerationAdmissionService.js";

import {
  claimImageGeneration,
  beginImageProviderCall,
} from "./mediaGenerationClaimService.js";

import { withGenerationLeaseHeartbeat } from "./media/mediaGenerationLeaseService.js";

import { completeClaimedImageGeneration } from "./media/mediaGenerationCompletionService.js";

import {
  getPrivateImageBucket,
  type ImageStorageBucket,
} from "./media/supabaseImageStorage.js";

import {
  ImageProviderError,
  type ImageProvider,
} from "./media/providers/imageProvider.js";

export class ImageGenerationOrchestrationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "ImageGenerationOrchestrationError";
  }
}

export type ImageGenerationSubmissionResult = {
  assetId: string;
  status: "pending" | "ready" | "failed";
  created: boolean;
  creditsChargedNow: number;
  contentSha256?: string;
};

type SubmitInput = {
  authUser: AuthenticatedUser;
  command: ImageGenerationCommand;
  config: ImageGenerationConfig;

  /**
   * Trusted backend dependencies.
   *
   * These are injected by the future controller/
   * worker composition root, never by HTTP input.
   */
  provider: ImageProvider;
  bucket?: ImageStorageBucket;
};

function result(
  asset: {
    _id: unknown;
    status: string;
    contentSha256?: string | null;
  },
  created: boolean,
  creditsChargedNow: number,
): ImageGenerationSubmissionResult {
  if (
    asset.status !== "pending" &&
    asset.status !== "ready" &&
    asset.status !== "failed"
  ) {
    throw new ImageGenerationOrchestrationError(
      "Unexpected media asset lifecycle state.",
      500,
    );
  }

  return {
    assetId: String(asset._id),
    status: asset.status,
    created,
    creditsChargedNow,
    ...(asset.contentSha256 ? { contentSha256: asset.contentSha256 } : {}),
  };
}

/**
 * Mark a definite provider rejection as failed.
 *
 * This is fenced by:
 * - asset ID
 * - workspace ID
 * - pending status
 * - provider_started phase
 * - active lease
 * - exact worker claim token
 *
 * An uncertain outcome is NOT eligible here.
 */
async function markDefiniteProviderRejection(
  workspaceId: string,
  assetId: string,
  claimToken: string,
) {
  const now = new Date();

  return MediaAsset.findOneAndUpdate(
    {
      _id: assetId,
      workspaceId,
      status: "pending",

      "generationExecution.phase": "provider_started",

      "generationExecution.claimToken": claimToken,

      "generationExecution.leaseExpiresAt": {
        $gt: now,
      },
    },
    {
      $set: {
        status: "failed",

        // Do not persist raw provider messages.
        failureReason: "The image provider rejected this generation.",
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
    },
  );
}

/**
 * Run one newly admitted operation.
 *
 * No code inside this function may retry a
 * provider call after provider_started.
 */
async function executeNewGeneration(
  input: SubmitInput,
  assetId: string,
): Promise<ImageGenerationSubmissionResult> {
  const workspaceId = input.command.workspaceId;

  const context = {
    authUser: input.authUser,
    workspaceId,
    assetId,
  };

  // Only one worker can claim a reserved asset.
  const claimed = await claimImageGeneration(context);

  const ownedContext = {
    ...context,
    claimToken: claimed.claimToken,
  };

  /**
   * Durable boundary:
   *
   * The provider may have charged us after this
   * update, even if the caller later times out.
   */
  await beginImageProviderCall(ownedContext);

  let generated: Awaited<ReturnType<ImageProvider["generate"]>>;

  try {
    generated = await withGenerationLeaseHeartbeat(ownedContext, () =>
      input.provider.generate({
        prompt: input.command.image.prompt,
        aspectRatio: input.command.image.aspectRatio,
      }),
    );
  } catch (error) {
    /**
     * Only a definite rejection explicitly
     * classified by the provider adapter can
     * transition directly to failed.
     *
     * A network failure, timeout, heartbeat
     * failure, or unknown exception remains
     * pending for conservative reconciliation.
     */
    if (error instanceof ImageProviderError && error.outcome === "rejected") {
      const failed = await markDefiniteProviderRejection(
        workspaceId,
        assetId,
        claimed.claimToken,
      );

      if (!failed) {
        throw new ImageGenerationOrchestrationError(
          "Provider rejected the request, but the claim is no longer valid. Recovery is required.",
          409,
        );
      }

      await releaseImageGenerationCapacity(
        input.authUser,
        workspaceId,
        assetId,
      );

      return result(failed, true, 1);
    }

    throw error;
  }

  /**
   * Provider identity is backend-controlled.
   *
   * Never accept mismatched provider/model
   * metadata as proof of a completed operation.
   */
  if (
    generated.provider !== input.provider.provider ||
    generated.model !== input.provider.model ||
    generated.mimeType !== "image/png"
  ) {
    throw new ImageGenerationOrchestrationError(
      "Provider returned inconsistent generation metadata. Recovery is required.",
      502,
    );
  }

  /**
   * This service:
   * - validates and normalizes bytes
   * - stores the expected SHA-256 first
   * - uploads to the private bucket
   * - verifies the uploaded object
   * - atomically marks the asset ready
   */
  const completed = await completeClaimedImageGeneration(
    {
      ...ownedContext,
      bytes: generated.bytes,
    },
    input.bucket ?? getPrivateImageBucket(),
  );

  /**
   * This operation is idempotent.
   *
   * If release fails after ready was persisted,
   * a future retry can perform release without
   * generating another image.
   */
  await releaseImageGenerationCapacity(input.authUser, workspaceId, assetId);

  return result(completed, true, 1);
}

/**
 * Main trusted image-generation orchestration.
 *
 * New requests are admitted and charged before
 * any provider call.
 *
 * Existing requests never trigger generation
 * again through this entry point.
 */
export async function submitImageGeneration(
  input: SubmitInput,
): Promise<ImageGenerationSubmissionResult> {
  const parsed = imageGenerationCommandSchema.safeParse(input.command);

  if (!parsed.success) {
    throw new ImageGenerationOrchestrationError(
      "Invalid image generation command.",
      400,
    );
  }

  if (
    input.provider.provider !== "mock" &&
    input.provider.provider !== "openai"
  ) {
    throw new ImageGenerationOrchestrationError(
      "Unsupported image provider.",
      500,
    );
  }

  /**
   * Never allow the mock provider to satisfy
   * a live OpenAI configuration or vice versa.
   */
  if (input.provider.provider !== input.config.IMAGE_GENERATION_PROVIDER) {
    throw new ImageGenerationOrchestrationError(
      "Image provider does not match server configuration.",
      500,
    );
  }

  if (input.provider.provider === "openai") {
    // Keep live execution disabled throughout
    // Step 12.2.4, regardless of configuration.
    throw new ImageGenerationOrchestrationError(
      "Live image generation is not enabled.",
      503,
    );
  }

  const command = parsed.data;

  const admitted = await admitImageGeneration({
    authUser: input.authUser,
    workspaceId: command.workspaceId,
    idempotencyKey: command.idempotencyKey,
    image: command.image,
    generation: {
      provider: input.provider.provider,
      model: input.provider.model,
    },
    policy: {
      dailyLimit: input.config.IMAGE_GENERATION_DAILY_WORKSPACE_LIMIT,

      maxActive: input.config.IMAGE_GENERATION_MAX_ACTIVE_WORKSPACE,
    },
  });

  const assetId = String(admitted.asset._id);

  /**
   * Retried idempotency keys never start
   * another provider invocation.
   */
  if (!admitted.created) {
    if (
      admitted.asset.status === "ready" ||
      admitted.asset.status === "failed"
    ) {
      // Also repairs an interrupted capacity
      // release after terminal persistence.
      await releaseImageGenerationCapacity(
        input.authUser,
        command.workspaceId,
        assetId,
      );
    }

    return result(admitted.asset, false, 0);
  }

  return executeNewGeneration({ ...input, command }, assetId);
}
