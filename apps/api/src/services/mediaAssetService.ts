import mongoose from "mongoose";

import MediaAsset, { type MediaAssetMimeType } from "../models/MediaAsset.js";

import UserProfile from "../models/UserProfile.js";
import Workspace from "../models/Workspace.js";

import type { AuthenticatedUser } from "./userProfileService.js";

import type { GenerateImageInput } from "../schemas/aiImageSchema.js";

export class MediaAssetServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "MediaAssetServiceError";
  }
}

const NOT_FOUND = "Media asset not found.";

function isObjectId(value: string): boolean {
  return mongoose.isObjectIdOrHexString(value);
}

/**
 * Reuses the authorization relationship
 * already established in Storm's Posts service.
 *
 * Never trust a workspaceId merely because
 * it is a valid MongoDB ObjectId.
 */
async function authorizeWorkspace(
  authUser: AuthenticatedUser,
  workspaceId: string,
) {
  if (!isObjectId(workspaceId)) {
    throw new MediaAssetServiceError("Workspace not found.", 404);
  }

  const profile = await UserProfile.findOne({
    supabaseUserId: authUser.id,
  }).select("_id");

  if (!profile) {
    throw new MediaAssetServiceError("Workspace not found.", 404);
  }

  const workspace = await Workspace.findOne({
    _id: workspaceId,
    ownerUserId: profile._id,
  }).select("_id");

  if (!workspace) {
    throw new MediaAssetServiceError("Workspace not found.", 404);
  }

  return {
    profileId: profile._id,
    workspaceId: workspace._id,
  };
}

/**
 * Creates metadata only.
 *
 * No provider request or file upload occurs here.
 */
export async function createPendingMediaAsset(
  authUser: AuthenticatedUser,
  workspaceId: string,
  input: GenerateImageInput,
  generation: {
    provider: string;
    model: string;
  },
) {
  const authorized = await authorizeWorkspace(authUser, workspaceId);

  const asset = new MediaAsset({
    workspaceId: authorized.workspaceId,
    createdByUserId: authorized.profileId,

    type: "image",
    source: "ai-generated",
    status: "pending",

    storageProvider: "supabase",

    generation: {
      provider: generation.provider,
      model: generation.model,
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
    },
  });

  await asset.save();

  return asset;
}

/**
 * All reads include the authorized workspace.
 */
export async function getWorkspaceMediaAsset(
  authUser: AuthenticatedUser,
  workspaceId: string,
  assetId: string,
) {
  const authorized = await authorizeWorkspace(authUser, workspaceId);

  if (!isObjectId(assetId)) {
    throw new MediaAssetServiceError(NOT_FOUND, 404);
  }

  const asset = await MediaAsset.findOne({
    _id: assetId,
    workspaceId: authorized.workspaceId,
  });

  if (!asset) {
    throw new MediaAssetServiceError(NOT_FOUND, 404);
  }

  return asset;
}

/**
 * Initial bounded listing.
 *
 * Cursor pagination can be added when
 * the Media Library UI is implemented.
 */
export async function listWorkspaceMediaAssets(
  authUser: AuthenticatedUser,
  workspaceId: string,
  limit = 20,
) {
  const authorized = await authorizeWorkspace(authUser, workspaceId);

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new MediaAssetServiceError("Limit must be between 1 and 100.", 400);
  }

  return MediaAsset.find({
    workspaceId: authorized.workspaceId,
  })
    .sort({
      createdAt: -1,
      _id: -1,
    })
    .limit(limit);
}

export type ReadyMediaMetadata = {
  storageKey: string;
  mimeType: MediaAssetMimeType;
  width: number;
  height: number;
  fileSize: number;
};

/**
 * Internal lifecycle operation.
 *
 * The future storage service must call this
 * only after confirming that the image has
 * been successfully uploaded.
 */
export async function markMediaAssetReady(
  authUser: AuthenticatedUser,
  workspaceId: string,
  assetId: string,
  metadata: ReadyMediaMetadata,
) {
  const current = await getWorkspaceMediaAsset(authUser, workspaceId, assetId);

  if (current.generationExecution) {
    throw new MediaAssetServiceError(
      "Claimed generations require claim-aware completion.",
      409,
    );
  }

  if (current.status !== "pending") {
    throw new MediaAssetServiceError("Media asset is no longer pending.", 409);
  }

  /**
   * Validate a complete candidate document.
   *
   * This executes pre("validate") middleware,
   * unlike an ordinary update query.
   */
  const candidate = new MediaAsset(current.toObject());

  candidate.set({
    status: "ready",
    storageKey: metadata.storageKey,
    mimeType: metadata.mimeType,
    width: metadata.width,
    height: metadata.height,
    fileSize: metadata.fileSize,
    failureReason: undefined,
  });

  await candidate.validate();

  /**
   * Atomic conditional transition.
   *
   * A concurrent failure or successful completion
   * prevents another update from matching.
   */
  const updated = await MediaAsset.findOneAndUpdate(
    {
      _id: current._id,
      workspaceId: current.workspaceId,
      status: "pending",
      generationExecution: { $exists: false },
    },
    {
      $set: {
        status: "ready",
        storageKey: metadata.storageKey,
        mimeType: metadata.mimeType,
        width: metadata.width,
        height: metadata.height,
        fileSize: metadata.fileSize,
      },
      $unset: {
        failureReason: "",
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  if (!updated) {
    throw new MediaAssetServiceError("Media asset is no longer pending.", 409);
  }

  return updated;
}

/**
 * Failure state is terminal.
 *
 * Caller-provided provider error details are
 * not saved directly to MongoDB.
 */
export async function markMediaAssetFailed(
  authUser: AuthenticatedUser,
  workspaceId: string,
  assetId: string,
) {
  const current = await getWorkspaceMediaAsset(authUser, workspaceId, assetId);

  if (current.generationExecution) {
    throw new MediaAssetServiceError(
      "Claimed generations require claim-aware completion.",
      409,
    );
  }

  if (current.status !== "pending") {
    throw new MediaAssetServiceError("Media asset is no longer pending.", 409);
  }

  const updated = await MediaAsset.findOneAndUpdate(
    {
      _id: current._id,
      workspaceId: current.workspaceId,
      status: "pending",
      generationExecution: { $exists: false },
    },
    {
      $set: {
        status: "failed",
        failureReason: "Image generation could not be completed.",
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  if (!updated) {
    throw new MediaAssetServiceError("Media asset is no longer pending.", 409);
  }

  return updated;
}
