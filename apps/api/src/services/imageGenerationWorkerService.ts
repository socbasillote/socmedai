import mongoose from "mongoose";

import MediaAsset from "../models/MediaAsset.js";
import UserProfile from "../models/UserProfile.js";

import { ImageGenerationAdmission } from "../models/ImageGenerationAccounting.js";

import type { AuthenticatedUser } from "./userProfileService.js";

import {
  claimImageGeneration,
  beginImageProviderCall,
} from "./mediaGenerationClaimService.js";

import { releaseImageGenerationCapacity } from "./imageGenerationAdmissionService.js";

import { withGenerationLeaseHeartbeat } from "./media/mediaGenerationLeaseService.js";

import { completeClaimedImageGeneration } from "./media/mediaGenerationCompletionService.js";

import {
  getPrivateImageBucket,
  type ImageStorageBucket,
} from "./media/supabaseImageStorage.js";

import { MockImageProvider } from "./media/providers/mockImageProvider.js";
import { OpenAIImageProvider } from "./media/providers/openaiImageProvider.js";
import { LIVE_PAID_WORKER_ARMED } from "./imageGenerationWorkerProviderGate.js";
import {
  parseLiveImageGateConfig,
  evaluateLiveImageGate,
} from "./imageGenerationLiveGate.js";
import {
  selectWorkerImageProvider,
  WorkerProviderNotAllowedError,
} from "./imageGenerationWorkerProviderGate.js";

import {
  ImageProviderError,
  type ImageProvider,
} from "./media/providers/imageProvider.js";

export class ImageGenerationWorkerError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 500,
  ) {
    super(message);
    this.name = "ImageGenerationWorkerError";
  }
}

export type ImageWorkerOutcome =
  | "idle"
  | "completed"
  | "rejected"
  | "claim_lost"
  | "recovery_required";

export type ImageWorkerResult = {
  outcome: ImageWorkerOutcome;
  assetId?: string;
};

export type ImageWorkerDependencies = {
  provider?: ImageProvider;
  bucket?: ImageStorageBucket;
};

type EligibleJob = {
  _id: mongoose.Types.ObjectId;
  workspaceId: mongoose.Types.ObjectId;
  createdByUserId: mongoose.Types.ObjectId;
};

/**
 * Query only reserved generations that have
 * a committed active credit admission.
 *
 * The lookup is performed in MongoDB, avoiding
 * a provider call for legacy/unpaid assets.
 */
export async function discoverReservedImageJobs(
  limit = 10,
): Promise<EligibleJob[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new ImageGenerationWorkerError("Invalid worker batch size.", 400);
  }

  const liveConfig = parseLiveImageGateConfig(process.env);
  const liveMode = liveConfig.provider === "openai";

  // Do not even discover OpenAI jobs while the executable is unarmed.
  // This must agree with the admission and startup gates.
  if (liveMode && !LIVE_PAID_WORKER_ARMED) {
    return [];
  }

  const approvedWorkspaces = liveMode
    ? [...liveConfig.workspaceAllowlist]
        .filter((id) => evaluateLiveImageGate(liveConfig, id).allowed)
        .map((id) => new mongoose.Types.ObjectId(id))
    : [];

  if (liveMode && approvedWorkspaces.length === 0) {
    return [];
  }

  const providerMatch = liveMode
    ? {
        "generation.provider": "openai",
        "generation.model": "gpt-image-2",
        workspaceId: { $in: approvedWorkspaces },
      }
    : {
        "generation.provider": "mock",
        "generation.model": "storm-mock-image-v1",
      };

  return MediaAsset.aggregate<EligibleJob>([
    {
      $match: {
        status: "pending",

        idempotencyKey: { $type: "string" },
        requestFingerprint: { $type: "string" },

        ...providerMatch,

        $or: [
          {
            "generationExecution.phase": "reserved",
          },
          {
            "generationExecution.phase": "claimed",

            "generationExecution.leaseExpiresAt": {
              $lte: new Date(),
            },

            "generationExecution.providerStartedAt": {
              $exists: false,
            },
          },
        ],
      },
    },
    { $sort: { createdAt: 1, _id: 1 } },
    {
      $lookup: {
        from: ImageGenerationAdmission.collection.name,
        let: {
          assetId: "$_id",
          workspaceId: "$workspaceId",
          userId: "$createdByUserId",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$assetId", "$$assetId"] },
                  {
                    $eq: ["$workspaceId", "$$workspaceId"],
                  },
                  { $eq: ["$userId", "$$userId"] },
                  { $eq: ["$state", "active"] },
                  liveMode
                    ? { $eq: ["$creditsCharged", 1] }
                    : { $gt: ["$creditsCharged", 0] },
                ],
              },
            },
          },
          { $limit: 1 },
        ],
        as: "admission",
      },
    },
    {
      $match: {
        "admission.0": { $exists: true },
      },
    },
    { $limit: limit },
    {
      $project: {
        _id: 1,
        workspaceId: 1,
        createdByUserId: 1,
      },
    },
  ]);
}

async function resolveWorkerIdentity(
  userId: mongoose.Types.ObjectId,
): Promise<AuthenticatedUser> {
  const profile = await UserProfile.findById(userId)
    .select("supabaseUserId")
    .lean();

  if (
    !profile ||
    typeof profile.supabaseUserId !== "string" ||
    !profile.supabaseUserId
  ) {
    throw new ImageGenerationWorkerError(
      "Generation owner is unavailable.",
      409,
    );
  }

  return {
    id: profile.supabaseUserId,
  } as AuthenticatedUser;
}

/**
 * Mark only a definitively rejected provider
 * request as failed.
 *
 * A stale or expired worker cannot finalize it.
 */
async function markProviderRejected(
  workspaceId: string,
  assetId: string,
  claimToken: string,
) {
  const failed = await MediaAsset.findOneAndUpdate(
    {
      _id: assetId,
      workspaceId,
      status: "pending",
      "generationExecution.phase": "provider_started",
      "generationExecution.claimToken": claimToken,
      "generationExecution.leaseExpiresAt": {
        $gt: new Date(),
      },
    },
    {
      $set: {
        status: "failed",
        failureReason: "The image provider rejected this generation.",
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
    },
  );

  if (!failed) {
    throw new ImageGenerationWorkerError(
      "Provider rejection could not be finalized safely.",
      409,
    );
  }

  return failed;
}

/**
 * Execute one eligible reserved job.
 *
 * This function never retries the provider
 * after the provider_started transition.
 */
export async function executeReservedImageJob(
  job: EligibleJob,
  dependencies: ImageWorkerDependencies = {},
): Promise<ImageWorkerResult> {
  const assetId = String(job._id);
  const workspaceId = String(job.workspaceId);

  // PRE-CLAIM PREFLIGHT: check the actual persisted provider identity.
  // Never claim a paid/unknown asset before it is supported by the worker.
  // This read does not authorize execution: claim fencing and the re-read
  // after provider_started below remain mandatory.
  const persisted = await MediaAsset.findOne({
    _id: job._id,
    workspaceId: job.workspaceId,
    createdByUserId: job.createdByUserId,
    status: "pending",
  })
    .select("generation.provider generation.model")
    .lean();

  if (!persisted) {
    return { outcome: "claim_lost", assetId };
  }

  // The existing provider gate is deliberately unarmed for paid calls.
  // An OpenAI or unknown persisted job fails here BEFORE claim and BEFORE
  // provider_started. Do not silently run a mock provider for that asset.
  let selected;
  try {
    selected = selectWorkerImageProvider(
      {
        workspaceId,
        provider: persisted.generation.provider,
        model: persisted.generation.model,
      },
      parseLiveImageGateConfig(process.env),
    );
  } catch (error) {
    if (error instanceof WorkerProviderNotAllowedError) {
      throw new ImageGenerationWorkerError(
        "Live image generation is disabled.",
        503,
      );
    }
    throw error;
  }

  // The provider-selection gate remains compile-time unarmed for paid calls.
  // This branch cannot run until the explicit release-review switch is changed.
  const provider: ImageProvider =
    dependencies.provider ??
    (selected.kind === "mock"
      ? new MockImageProvider()
      : new OpenAIImageProvider({
          apiKey: process.env.OPENAI_API_KEY ?? "",
          model: selected.model,
          fetchImpl: fetch,
        }));

  if (
    provider.provider !== persisted.generation.provider ||
    provider.model !== persisted.generation.model ||
    (selected.kind === "mock" &&
      (provider.provider !== "mock" ||
        provider.model !== "storm-mock-image-v1"))
  ) {
    throw new ImageGenerationWorkerError(
      "Persisted image provider does not match the worker.",
      503,
    );
  }

  const authUser = await resolveWorkerIdentity(job.createdByUserId);

  const context = {
    authUser,
    workspaceId,
    assetId,
  };

  let claimToken: string;

  try {
    const claimed = await claimImageGeneration(context);

    claimToken = claimed.claimToken;
  } catch (error) {
    // Another worker may have won the claim
    // between discovery and execution.
    if (
      error instanceof Error &&
      "statusCode" in error &&
      error.statusCode === 409
    ) {
      return {
        outcome: "claim_lost",
        assetId,
      };
    }

    throw error;
  }

  const owned = {
    ...context,
    claimToken,
  };

  /**
   * Persist provider_started before the
   * provider is ever invoked.
   *
   * If this fails, no provider call happens.
   */
  await beginImageProviderCall(owned);

  // Reload the owned asset to obtain immutable
  // generation instructions.
  const asset = await MediaAsset.findOne({
    _id: job._id,
    workspaceId: job.workspaceId,
    status: "pending",
    "generationExecution.phase": "provider_started",
    "generationExecution.claimToken": claimToken,
    "generationExecution.leaseExpiresAt": {
      $gt: new Date(),
    },
  });

  if (!asset) {
    return {
      outcome: "claim_lost",
      assetId,
    };
  }

  if (
    asset.generation.provider !== provider.provider ||
    asset.generation.model !== provider.model
  ) {
    // Do not invoke a different provider or
    // model from the one originally reserved.
    return {
      outcome: "recovery_required",
      assetId,
    };
  }

  let generated: Awaited<ReturnType<ImageProvider["generate"]>>;

  try {
    generated = await withGenerationLeaseHeartbeat(owned, () =>
      provider.generate({
        prompt: asset.generation.prompt,
        aspectRatio: asset.generation.aspectRatio,
      }),
    );
  } catch (error) {
    if (error instanceof ImageProviderError && error.outcome === "rejected") {
      await markProviderRejected(workspaceId, assetId, claimToken);

      await releaseImageGenerationCapacity(authUser, workspaceId, assetId);

      return {
        outcome: "rejected",
        assetId,
      };
    }

    // Unknown/ambiguous outcomes are never
    // retried. Leave pending for reconciliation.
    return {
      outcome: "recovery_required",
      assetId,
    };
  }

  if (
    generated.provider !== provider.provider ||
    generated.model !== provider.model ||
    generated.mimeType !== "image/png"
  ) {
    return {
      outcome: "recovery_required",
      assetId,
    };
  }

  try {
    await completeClaimedImageGeneration(
      {
        ...owned,
        bytes: generated.bytes,
      },
      dependencies.bucket ?? getPrivateImageBucket(),
    );
  } catch {
    // Storage may already contain an uploaded
    // object. Do not regenerate or delete it.
    return {
      outcome: "recovery_required",
      assetId,
    };
  }

  // If release fails, preserve the ready asset.
  // Step 12.3.3 will reconcile the active slot.
  await releaseImageGenerationCapacity(authUser, workspaceId, assetId);

  return {
    outcome: "completed",
    assetId,
  };
}

/**
 * Process one bounded batch.
 *
 * The worker processes sequentially inside
 * each instance; multiple instances may race
 * safely through MongoDB claim fencing.
 */
export async function runImageGenerationWorkerOnce(
  dependencies: ImageWorkerDependencies = {},
  limit = 10,
): Promise<ImageWorkerResult[]> {
  const jobs = await discoverReservedImageJobs(limit);

  if (jobs.length === 0) {
    return [{ outcome: "idle" }];
  }

  const results: ImageWorkerResult[] = [];

  for (const job of jobs) {
    try {
      results.push(await executeReservedImageJob(job, dependencies));
    } catch {
      // The job remains durably persisted.
      // Do not automatically repeat it here.
      results.push({
        outcome: "recovery_required",
        assetId: String(job._id),
      });
    }
  }

  return results;
}
