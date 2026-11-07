import { createHash } from "node:crypto";
import mongoose from "mongoose";

import UserProfile from "../../models/UserProfile.js";
import Workspace from "../../models/Workspace.js";

import MediaAsset from "../../models/MediaAsset.js";

import type { AuthenticatedUser } from "../userProfileService.js";

import { getWorkspaceMediaAsset } from "../mediaAssetService.js";

import {
  getImageStorageKey,
  getPrivateImageBucket,
  type ImageStorageBucket,
} from "./supabaseImageStorage.js";

import { validateGeneratedImage } from "./imageValidation.js";

export class MediaGenerationRecoveryError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "MediaGenerationRecoveryError";
  }
}

export type RecoveryContext = {
  authUser: AuthenticatedUser;
  workspaceId: string;
  assetId: string;
};

export type RecoveryOutcome =
  | "terminal"
  | "safe_to_claim"
  | "lease_active"
  | "recovery_required"
  | "storage_unavailable"
  | "invalid_stored_image"
  | "unanchored_image"
  | "checksum_mismatch"
  | "checksum_verified";

export type RecoveryResult = {
  assetId: string;
  outcome: RecoveryOutcome;
  status: string;
  phase: string;
  canRepeatProviderCall: false;
  canClaimBeforeProvider: boolean;
  objectSha256?: string;
};

const SAFE_CLAIM_PHASES = ["reserved", "claimed"] as const;

function result(
  assetId: string,
  status: string,
  phase: string,
  outcome: RecoveryOutcome,
  canClaimBeforeProvider = false,
  objectSha256?: string,
): RecoveryResult {
  return {
    assetId,
    status,
    phase,
    outcome,
    canRepeatProviderCall: false,
    canClaimBeforeProvider,
    ...(objectSha256 ? { objectSha256 } : {}),
  };
}

/**
 * Inspect an authorized generation's durable state.
 *
 * This method does not perform any provider call,
 * storage upload, or automatic worker claim.
 */
export async function inspectGenerationRecovery(
  context: RecoveryContext,
): Promise<RecoveryResult> {
  const asset = await getWorkspaceMediaAsset(
    context.authUser,
    context.workspaceId,
    context.assetId,
  );

  const assetId = String(asset._id);
  const phase = asset.generationExecution?.phase;

  if (asset.status !== "pending") {
    return result(assetId, asset.status, phase ?? "legacy", "terminal");
  }

  if (!phase) {
    throw new MediaGenerationRecoveryError(
      "This asset does not use generation tracking.",
      409,
    );
  }

  if (phase === "reserved") {
    return result(assetId, asset.status, phase, "safe_to_claim", true);
  }

  if (phase === "claimed") {
    const expiresAt = asset.generationExecution?.leaseExpiresAt;

    const providerStartedAt = asset.generationExecution?.providerStartedAt;

    if (!providerStartedAt && expiresAt && expiresAt.getTime() <= Date.now()) {
      return result(assetId, asset.status, phase, "safe_to_claim", true);
    }

    return result(assetId, asset.status, phase, "lease_active");
  }

  return result(assetId, asset.status, phase, "recovery_required");
}

/**
 * Mark a provably expired post-provider lease
 * as needing reconciliation.
 *
 * This is an atomic state transition.
 *
 * A worker that subsequently tries to finalize
 * using the previous phase will fail its
 * conditional MongoDB completion update.
 */
export async function flagExpiredGeneration(context: RecoveryContext) {
  const current = await getWorkspaceMediaAsset(
    context.authUser,
    context.workspaceId,
    context.assetId,
  );

  if (current.status !== "pending" || !current.generationExecution) {
    return inspectGenerationRecovery(context);
  }

  const phase = current.generationExecution.phase;

  if (phase !== "provider_started" && phase !== "storage_pending") {
    return inspectGenerationRecovery(context);
  }

  const now = new Date();

  const updated = await MediaAsset.findOneAndUpdate(
    {
      _id: current._id,
      workspaceId: current.workspaceId,
      status: "pending",

      "generationExecution.phase": phase,

      "generationExecution.claimToken": current.generationExecution.claimToken,

      "generationExecution.leaseExpiresAt": {
        $lte: now,
      },
    },
    {
      $set: {
        "generationExecution.phase": "recovery_required",
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
    },
  );

  // If a race occurred, inspect the winner's
  // current state instead of overwriting it.
  if (!updated) {
    return inspectGenerationRecovery(context);
  }

  return result(
    String(updated._id),
    updated.status,
    "recovery_required",
    "recovery_required",
  );
}

/**
 * Inspect the deterministic private object
 * associated with an uncertain generation.
 *
 * No object deletion, retry, upload, or asset
 * finalization occurs here.
 */
export async function inspectStoredGeneration(
  context: RecoveryContext,
  bucket?: ImageStorageBucket,
): Promise<RecoveryResult> {
  const state = await flagExpiredGeneration(context);

  if (state.status !== "pending" || state.phase !== "recovery_required") {
    return state;
  }

  const asset = await getWorkspaceMediaAsset(
    context.authUser,
    context.workspaceId,
    context.assetId,
  );

  // Recheck state before reaching storage.
  if (
    asset.status !== "pending" ||
    asset.generationExecution?.phase !== "recovery_required"
  ) {
    return inspectGenerationRecovery(context);
  }

  const key = getImageStorageKey(context.workspaceId, context.assetId);

  const storage = bucket ?? getPrivateImageBucket();

  let bytes: Buffer;

  try {
    const download = await storage.download(key);

    if (download.error || !download.data) {
      return result(
        context.assetId,
        "pending",
        "recovery_required",
        "storage_unavailable",
      );
    }

    // Guard against unexpectedly large downloads.
    const maxBytes = 20 * 1024 * 1024;

    if (download.data.size > maxBytes) {
      return result(
        context.assetId,
        "pending",
        "recovery_required",
        "invalid_stored_image",
      );
    }

    bytes = Buffer.from(await download.data.arrayBuffer());

    if (bytes.length > maxBytes) {
      return result(
        context.assetId,
        "pending",
        "recovery_required",
        "invalid_stored_image",
      );
    }
  } catch {
    return result(
      context.assetId,
      "pending",
      "recovery_required",
      "storage_unavailable",
    );
  }

  try {
    const image = await validateGeneratedImage(bytes);

    // Storage must already contain a normalized
    // PNG, not an image that can merely be
    // transformed into a valid PNG.
    if (!bytes.equals(image.bytes)) {
      return result(
        context.assetId,
        "pending",
        "recovery_required",
        "invalid_stored_image",
      );
    }
  } catch {
    return result(
      context.assetId,
      "pending",
      "recovery_required",
      "invalid_stored_image",
    );
  }

  const actualSha256 = createHash("sha256").update(bytes).digest("hex");

  const persistedSha256 = asset.contentSha256;

  if (!persistedSha256) {
    return result(
      context.assetId,
      "pending",
      "recovery_required",
      "unanchored_image",
      false,
      actualSha256,
    );
  }

  if (persistedSha256 !== actualSha256) {
    return result(
      context.assetId,
      "pending",
      "recovery_required",
      "checksum_mismatch",
    );
  }

  return result(
    context.assetId,
    "pending",
    "recovery_required",
    "checksum_verified",
    false,
    actualSha256,
  );
}

/**
 * A bounded workspace-scoped discovery operation
 * for expired post-provider generations.
 *
 * Discovery alone never changes lifecycle state.
 * Call flagExpiredGeneration for each candidate
 * after applying your operational retry limits.
 */
export async function listExpiredGenerationIds(
  authUser: AuthenticatedUser,
  workspaceId: string,
  limit = 20,
): Promise<string[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new MediaGenerationRecoveryError("Invalid recovery scan limit.", 400);
  }

  if (!mongoose.isObjectIdOrHexString(workspaceId)) {
    throw new MediaGenerationRecoveryError("Workspace not found.", 404);
  }

  const profile = await UserProfile.findOne({
    supabaseUserId: authUser.id,
  }).select("_id");

  if (!profile) {
    throw new MediaGenerationRecoveryError("Workspace not found.", 404);
  }

  const workspace = await Workspace.findOne({
    _id: workspaceId,
    ownerUserId: profile._id,
  }).select("_id");

  if (!workspace) {
    throw new MediaGenerationRecoveryError("Workspace not found.", 404);
  }

  const expired = await MediaAsset.find({
    workspaceId: workspace._id,
    status: "pending",

    "generationExecution.phase": {
      $in: ["provider_started", "storage_pending"],
    },

    "generationExecution.leaseExpiresAt": {
      $lte: new Date(),
    },
  })
    .select("_id")
    .sort({ _id: 1 })
    .limit(limit)
    .lean();

  return expired.map((asset) => String(asset._id));
}
