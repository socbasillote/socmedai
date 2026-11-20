import mongoose from "mongoose";

import MediaAsset from "../../models/MediaAsset.js";
import UserProfile from "../../models/UserProfile.js";
import Workspace from "../../models/Workspace.js";

import type { AuthenticatedUser } from "../userProfileService.js";

import { isPreviewReadyImage } from "./imageEligibility.js";

export type MediaLibraryScope = "current" | "all";

export type MediaLibraryInput = {
  authUser: AuthenticatedUser;
  workspaceId: string;
  scope: MediaLibraryScope;
  limit?: number;
};

export class MediaLibraryError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "MediaLibraryError";
  }
}

const OBJECT_ID = /^[a-fA-F0-9]{24}$/;

export async function listAuthorizedMediaLibrary({
  authUser,
  workspaceId,
  scope,
  limit = 12,
}: MediaLibraryInput) {
  if (!authUser?.id || !OBJECT_ID.test(workspaceId)) {
    throw new MediaLibraryError("Workspace not found.", 404);
  }

  if (scope !== "current" && scope !== "all") {
    throw new MediaLibraryError("Invalid media library scope.", 400);
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 30) {
    throw new MediaLibraryError("Limit must be between 1 and 30.", 400);
  }

  // Resolve the authenticated user to the
  // internal MongoDB profile identity.
  const profile = await UserProfile.findOne({
    supabaseUserId: authUser.id,
  })
    .select("_id")
    .lean();

  if (!profile) {
    throw new MediaLibraryError("Workspace not found.", 404);
  }

  // Verify access to the active workspace
  // regardless of the requested library scope.
  const activeWorkspace = await Workspace.findOne({
    _id: workspaceId,
    ownerUserId: profile._id,
  })
    .select("_id name")
    .lean();

  if (!activeWorkspace) {
    throw new MediaLibraryError("Workspace not found.", 404);
  }

  const workspaces =
    scope === "current"
      ? [activeWorkspace]
      : await Workspace.find({
          ownerUserId: profile._id,
        })
          .select("_id name")
          .lean();

  const workspaceIds = workspaces.map((workspace) => workspace._id);

  const workspaceNames = new Map(
    workspaces.map((workspace) => [String(workspace._id), workspace.name]),
  );

  // Only images created by this user in
  // their currently authorized workspaces.
  //
  // Do not return storage keys, prompts,
  // signing credentials, or private URLs.
  const assets = await MediaAsset.find({
    workspaceId: {
      $in: workspaceIds,
    },
    createdByUserId: profile._id,
    type: "image",
    source: { $in: ["ai-generated", "uploaded"] },
    status: "ready",
    storageKey: {
      $type: "string",
      $ne: "",
    },
    mimeType: "image/png",
    width: { $gte: 1 },
    height: { $gte: 1 },
    fileSize: { $gte: 1 },
    storageProvider: "supabase",
    $or: [
      { source: "uploaded" },
      { source: "ai-generated", idempotencyKey: { $type: "string", $ne: "" }, generationExecution: { $exists: true, $ne: null } },
    ],
    contentSha256: /^[a-f0-9]{64}$/,
  })
    .select(
      "_id workspaceId type source status " +
        "storageProvider storageKey mimeType " +
        "width height fileSize idempotencyKey " +
        "generationExecution contentSha256 createdAt",
    )
    .sort({
      createdAt: -1,
      _id: -1,
    })
    .limit(limit)
    .lean();

  return {
    scope,
    activeWorkspaceId: String(activeWorkspace._id),

    images: assets
      .filter((asset) => isPreviewReadyImage(asset))
      .map((asset) => {
        const sourceWorkspaceId = String(asset.workspaceId);

        return {
          assetId: String(asset._id),
          sourceWorkspaceId,
          sourceWorkspaceName:
            workspaceNames.get(sourceWorkspaceId) ?? "Workspace",
          type: "image" as const,
          mimeType: asset.mimeType,
          width: asset.width,
          height: asset.height,
          createdAt: asset.createdAt.toISOString(),
        };
      }),
  };
}

export async function getAuthorizedMediaLibraryItem(
  authUser: AuthenticatedUser,
  assetId: string,
) {
  if (!authUser?.id || !OBJECT_ID.test(assetId)) {
    throw new MediaLibraryError("Media asset not found.", 404);
  }

  const profile = await UserProfile.findOne({
    supabaseUserId: authUser.id,
  })
    .select("_id")
    .lean();

  if (!profile) {
    throw new MediaLibraryError("Media asset not found.", 404);
  }

  // Require a ready, complete image owned by
  // the authenticated user.
  const asset = await MediaAsset.findOne({
    _id: assetId,
    createdByUserId: profile._id,
    type: "image",
    source: { $in: ["ai-generated", "uploaded"] },
    status: "ready",
    storageProvider: "supabase",
    storageKey: {
      $type: "string",
      $ne: "",
    },
    mimeType: {
      $in: ["image/png", "image/jpeg", "image/webp"],
    },
    width: { $gte: 1 },
    height: { $gte: 1 },
    fileSize: { $gte: 1 },
  })
    .select(
      "_id workspaceId type source status " +
        "storageProvider storageKey mimeType " +
        "width height fileSize idempotencyKey " +
        "generationExecution contentSha256 createdAt",
    )
    .lean();

  if (!asset) {
    throw new MediaLibraryError("Media asset not found.", 404);
  }

  // Reauthorize the image's ORIGINAL workspace.
  // This prevents access after workspace ownership
  // changes or the source workspace is deleted.
  const sourceWorkspace = await Workspace.findOne({
    _id: asset.workspaceId,
    ownerUserId: profile._id,
  })
    .select("_id name")
    .lean();

  if (!sourceWorkspace) {
    throw new MediaLibraryError("Media asset not found.", 404);
  }

  // Authorization is complete.
  //
  // A valid media ID is not sufficient: the asset must
  // also satisfy Storm's private-preview requirements.
  if (!isPreviewReadyImage(asset)) {
    throw new MediaLibraryError("Media asset not found.", 404);
  }

  return {
    assetId: String(asset._id),
    sourceWorkspaceId: String(sourceWorkspace._id),
    sourceWorkspaceName: sourceWorkspace.name,
    type: "image" as const,
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height,
    createdAt: asset.createdAt.toISOString(),
  };
}
