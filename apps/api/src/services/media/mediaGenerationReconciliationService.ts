import MediaAsset from "../../models/MediaAsset.js";

import type { AuthenticatedUser } from "../userProfileService.js";

import { getWorkspaceMediaAsset } from "../mediaAssetService.js";

import {
  flagExpiredGeneration,
  inspectStoredGeneration,
} from "./mediaGenerationRecoveryService.js";

import {
  getImageStorageKey,
  getPrivateImageBucket,
  type ImageStorageBucket,
} from "./supabaseImageStorage.js";

import { MAX_IMAGE_BYTES, validateGeneratedImage } from "./imageValidation.js";

export class MediaGenerationReconciliationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "MediaGenerationReconciliationError";
  }
}

export type ReconciliationContext = {
  authUser: AuthenticatedUser;
  workspaceId: string;
  assetId: string;
};

export type ImageReconciliationResult = {
  assetId: string;
  outcome:
    | "already_terminal"
    | "lease_active"
    | "verified_ready"
    | "already_reconciled"
    | "manual_review_required";
  reason?: string;
};

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

/**
 * Finalize only an image that was verified
 * against a trusted pre-upload checksum.
 *
 * Never calls an image provider.
 * Never retries uploads.
 * Never deletes objects.
 */
export async function reconcileVerifiedImageGeneration(
  context: ReconciliationContext,
  bucket: ImageStorageBucket = getPrivateImageBucket(),
): Promise<ImageReconciliationResult> {
  const initial = await getWorkspaceMediaAsset(
    context.authUser,
    context.workspaceId,
    context.assetId,
  );

  if (initial.status === "ready" || initial.status === "failed") {
    return {
      assetId: context.assetId,
      outcome: "already_terminal",
    };
  }

  if (!initial.generationExecution || !initial.idempotencyKey) {
    throw new MediaGenerationReconciliationError(
      "Generation is not managed by the durable worker.",
      409,
    );
  }

  /**
   * The original worker must have expired
   * before recovery can take over.
   *
   * flagExpiredGeneration performs an atomic
   * phase transition when eligible.
   */
  await flagExpiredGeneration(context);

  const current = await getWorkspaceMediaAsset(
    context.authUser,
    context.workspaceId,
    context.assetId,
  );

  if (current.status !== "pending") {
    return {
      assetId: context.assetId,
      outcome: "already_terminal",
    };
  }

  const phase = current.generationExecution?.phase;

  if (phase !== "recovery_required") {
    return {
      assetId: context.assetId,
      outcome: "lease_active",
    };
  }

  if (!current.contentSha256 || !SHA256_PATTERN.test(current.contentSha256)) {
    return {
      assetId: context.assetId,
      outcome: "manual_review_required",
      reason: "missing_checkpoint",
    };
  }

  /**
   * Existing recovery inspection verifies:
   * - deterministic private storage path
   * - image decoding and normalized PNG bytes
   * - SHA-256 equality with the persisted
   *   pre-upload checkpoint
   */
  const inspection = await inspectStoredGeneration(context, bucket);

  if (
    inspection.outcome !== "checksum_verified" ||
    inspection.objectSha256 !== current.contentSha256
  ) {
    return {
      assetId: context.assetId,
      outcome: "manual_review_required",
      reason: inspection.outcome,
    };
  }

  const expectedKey = getImageStorageKey(context.workspaceId, context.assetId);

  /**
   * Read bytes again to obtain authoritative
   * width, height, and file size.
   *
   * The object is created with upsert:false
   * by the storage adapter.
   */
  const downloaded = await bucket.download(expectedKey);

  if (
    downloaded.error ||
    !downloaded.data ||
    downloaded.data.size > MAX_IMAGE_BYTES
  ) {
    return {
      assetId: context.assetId,
      outcome: "manual_review_required",
      reason: "storage_unavailable",
    };
  }

  let verified;

  try {
    const bytes = Buffer.from(await downloaded.data.arrayBuffer());

    verified = await validateGeneratedImage(bytes);

    if (
      !bytes.equals(verified.bytes) ||
      verified.sha256 !== current.contentSha256
    ) {
      return {
        assetId: context.assetId,
        outcome: "manual_review_required",
        reason: "checksum_mismatch",
      };
    }
  } catch {
    return {
      assetId: context.assetId,
      outcome: "manual_review_required",
      reason: "invalid_stored_image",
    };
  }

  /**
   * Run Mongoose document validation before
   * the final atomic state transition.
   */
  const candidate = new MediaAsset(current.toObject());

  candidate.set({
    status: "ready",
    storageKey: expectedKey,
    mimeType: "image/png",
    width: verified.width,
    height: verified.height,
    fileSize: verified.fileSize,
    contentSha256: verified.sha256,
  });

  await candidate.validate();

  /**
   * Fencing protects against another
   * reconciler or a racing worker.
   *
   * Only one can transition this exact
   * recovery_required operation to ready.
   */
  const completed = await MediaAsset.findOneAndUpdate(
    {
      _id: current._id,
      workspaceId: current.workspaceId,
      status: "pending",

      "generationExecution.phase": "recovery_required",

      "generationExecution.claimToken": current.generationExecution?.claimToken,

      "generationExecution.leaseExpiresAt": {
        $lte: new Date(),
      },

      contentSha256: verified.sha256,
    },
    {
      $set: {
        status: "ready",
        storageKey: expectedKey,
        mimeType: "image/png",
        width: verified.width,
        height: verified.height,
        fileSize: verified.fileSize,
        contentSha256: verified.sha256,
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
    const latest = await getWorkspaceMediaAsset(
      context.authUser,
      context.workspaceId,
      context.assetId,
    );

    if (
      latest.status === "ready" &&
      latest.contentSha256 === verified.sha256 &&
      latest.storageKey === expectedKey
    ) {
      return {
        assetId: context.assetId,
        outcome: "already_reconciled",
      };
    }

    return {
      assetId: context.assetId,
      outcome: "manual_review_required",
      reason: "ownership_changed",
    };
  }

  return {
    assetId: context.assetId,
    outcome: "verified_ready",
  };
}
