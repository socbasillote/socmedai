import mongoose from "mongoose";

import MediaAsset from "../../models/MediaAsset.js";

import type { AuthenticatedUser } from "../userProfileService.js";

import { getWorkspaceMediaAsset } from "../mediaAssetService.js";

import {
  getImageStorageKey,
  getPrivateImageBucket,
  uploadGeneratedImage,
  type ImageStorageBucket,
  type StoredImage,
} from "./supabaseImageStorage.js";

import {
  validateGeneratedImage,
  type ValidatedImage,
} from "./imageValidation.js";

import {
  renewGenerationLease,
  withGenerationLeaseHeartbeat,
} from "./mediaGenerationLeaseService.js";

import { prepareBrandedGeneratedImage } from "./prepareBrandedGeneratedImage.js";

export class MediaGenerationCompletionError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "MediaGenerationCompletionError";
  }
}

export type GenerationCompletionContext = {
  authUser: AuthenticatedUser;
  workspaceId: string;
  assetId: string;
  claimToken: string;
};

export type CompleteClaimedGenerationInput = GenerationCompletionContext & {
  bytes: Uint8Array;
};

const CLAIM_CONFLICT = "Generation ownership or lifecycle state has changed.";

/**
 * Durable checkpoint BEFORE object upload.
 *
 * This update atomically writes:
 * - storage_pending phase
 * - expected normalized image SHA-256
 *
 * No client can provide the digest.
 */
async function beginClaimedStorage(
  context: GenerationCompletionContext,
  image: ValidatedImage,
) {
  const current = await getWorkspaceMediaAsset(
    context.authUser,
    context.workspaceId,
    context.assetId,
  );

  if (
    current.status !== "pending" ||
    current.generationExecution?.phase !== "provider_started" ||
    current.generationExecution?.claimToken !== context.claimToken
  ) {
    throw new MediaGenerationCompletionError(CLAIM_CONFLICT, 409);
  }

  const now = new Date();

  const updated = await MediaAsset.findOneAndUpdate(
    {
      _id: current._id,
      workspaceId: current.workspaceId,
      status: "pending",

      "generationExecution.phase": "provider_started",

      "generationExecution.claimToken": context.claimToken,

      "generationExecution.leaseExpiresAt": {
        $gt: now,
      },

      contentSha256: { $exists: false },
    },
    {
      $set: {
        "generationExecution.phase": "storage_pending",

        contentSha256: image.sha256,
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
    },
  );

  if (!updated) {
    throw new MediaGenerationCompletionError(CLAIM_CONFLICT, 409);
  }

  return updated;
}

/**
 * Atomically finalize the owned generation.
 *
 * Both the storage object's key and verified
 * SHA-256 must match our durable expectations.
 */
async function finalizeClaimedGeneration(
  context: GenerationCompletionContext,
  image: StoredImage,
) {
  const current = await getWorkspaceMediaAsset(
    context.authUser,
    context.workspaceId,
    context.assetId,
  );

  const expectedKey = getImageStorageKey(context.workspaceId, context.assetId);

  if (
    current.status !== "pending" ||
    current.generationExecution?.phase !== "storage_pending" ||
    current.generationExecution?.claimToken !== context.claimToken
  ) {
    throw new MediaGenerationCompletionError(CLAIM_CONFLICT, 409);
  }

  if (
    image.storageKey !== expectedKey ||
    current.contentSha256 !== image.sha256 ||
    !/^[a-f0-9]{64}$/.test(image.sha256) ||
    !mongoose.isObjectIdOrHexString(context.assetId)
  ) {
    throw new MediaGenerationCompletionError(
      "Stored image does not match the generation checkpoint.",
      409,
    );
  }

  // Execute complete document validation,
  // including pre("validate") middleware.
  const candidate = new MediaAsset(current.toObject());

  candidate.set({
    status: "ready",
    storageKey: image.storageKey,
    mimeType: image.mimeType,
    width: image.width,
    height: image.height,
    fileSize: image.fileSize,
    contentSha256: image.sha256,
  });

  await candidate.validate();

  const now = new Date();

  const completed = await MediaAsset.findOneAndUpdate(
    {
      _id: current._id,
      workspaceId: current.workspaceId,
      status: "pending",

      "generationExecution.phase": "storage_pending",

      "generationExecution.claimToken": context.claimToken,

      "generationExecution.leaseExpiresAt": {
        $gt: now,
      },

      contentSha256: image.sha256,
    },
    {
      $set: {
        status: "ready",
        storageKey: image.storageKey,
        mimeType: image.mimeType,
        width: image.width,
        height: image.height,
        fileSize: image.fileSize,
        contentSha256: image.sha256,
      },

      $unset: {
        failureReason: "",
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
    },
  );

  if (!completed) {
    throw new MediaGenerationCompletionError(CLAIM_CONFLICT, 409);
  }

  return completed;
}

/**
 * Trusted worker-only operation.
 *
 * The provider response must already exist.
 * No paid provider call is performed here.
 */
export async function completeClaimedImageGeneration(
  input: CompleteClaimedGenerationInput,
  bucket: ImageStorageBucket = getPrivateImageBucket(),
) {
  // Authenticate and authorize before
  // performing expensive image decoding.
  const current = await getWorkspaceMediaAsset(
    input.authUser,
    input.workspaceId,
    input.assetId,
  );

  if (
    current.status !== "pending" ||
    current.generationExecution?.phase !== "provider_started" ||
    current.generationExecution?.claimToken !== input.claimToken
  ) {
    throw new MediaGenerationCompletionError(CLAIM_CONFLICT, 409);
  }

  await renewGenerationLease(input);

  // The source of branding configuration is the
  // persisted MediaAsset snapshot, not Workspace.
  //
  // Keep the generation lease alive during private
  // logo download, Sharp work, and normalization.

  const normalized = await withGenerationLeaseHeartbeat(input, () =>
    prepareBrandedGeneratedImage(
      {
        workspaceId: input.workspaceId,

        bytes: input.bytes,

        // Preserve compatibility with assets
        // created before brandingSnapshot.
        snapshot: current.logoOverlaySnapshot
          ? current.logoOverlaySnapshot.toObject()
          : null,

        // New per-image immutable instructions.
        brandingSnapshot: current.brandingSnapshot
          ? current.brandingSnapshot.toObject()
          : null,
      },
      bucket,
    ),
  );

  // Revalidate claim ownership before writing the
  // final branded PNG's durable checksum.
  await renewGenerationLease(input);

  // Crucial crash-safety boundary:
  // expected SHA is durable before upload.
  await beginClaimedStorage(input, normalized);

  // Maintain ownership while Supabase processes
  // the upload and read-back verification.
  const stored = await withGenerationLeaseHeartbeat(input, () =>
    uploadGeneratedImage(
      {
        workspaceId: input.workspaceId,
        assetId: input.assetId,
        bytes: normalized.bytes,
      },
      bucket,
    ),
  );

  if (
    stored.sha256 !== normalized.sha256 ||
    stored.fileSize !== normalized.fileSize ||
    stored.width !== normalized.width ||
    stored.height !== normalized.height
  ) {
    throw new MediaGenerationCompletionError(
      "Uploaded image differs from the durable generation checkpoint.",
      409,
    );
  }

  // If the database update fails, retain the
  // private object for checksum-based recovery.
  return finalizeClaimedGeneration(input, stored);
}
