import mongoose from "mongoose";

import MediaAsset from "../../models/MediaAsset.js";
import UserProfile from "../../models/UserProfile.js";
import Workspace from "../../models/Workspace.js";

import type { AuthenticatedUser } from "../userProfileService.js";
import { isPreviewReadyImage } from "./imageEligibility.js";

export class DraftMediaAttachmentError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "DraftMediaAttachmentError";
  }
}

const OBJECT_ID_PATTERN = /^[a-fA-F0-9]{24}$/;
const MAX_MEDIA_ITEMS = 20;

export type ValidateDraftMediaAttachmentsInput = {
  authUser: AuthenticatedUser;
  destinationWorkspaceId: string;
  mediaIds: readonly string[];
};

export async function validateDraftMediaAttachments({
  authUser,
  destinationWorkspaceId,
  mediaIds,
}: ValidateDraftMediaAttachmentsInput): Promise<string[]> {
  if (!authUser?.id || !OBJECT_ID_PATTERN.test(destinationWorkspaceId)) {
    throw new DraftMediaAttachmentError("Workspace not found.", 404);
  }

  if (!Array.isArray(mediaIds) || mediaIds.length > MAX_MEDIA_ITEMS) {
    throw new DraftMediaAttachmentError(
      "A draft can contain at most 20 media items.",
      400,
    );
  }

  if (
    mediaIds.some((id) => typeof id !== "string" || !OBJECT_ID_PATTERN.test(id))
  ) {
    throw new DraftMediaAttachmentError("Invalid media attachment ID.", 400);
  }

  const normalizedIds = mediaIds.map((id) => id.toLowerCase());

  if (new Set(normalizedIds).size !== normalizedIds.length) {
    throw new DraftMediaAttachmentError(
      "Duplicate media attachments are not allowed.",
      400,
    );
  }

  const profile = await UserProfile.findOne({
    supabaseUserId: authUser.id,
  })
    .select("_id")
    .lean();

  if (!profile) {
    throw new DraftMediaAttachmentError("Workspace not found.", 404);
  }

  // Authorize the destination workspace first.
  const destinationWorkspace = await Workspace.findOne({
    _id: destinationWorkspaceId,
    ownerUserId: profile._id,
  })
    .select("_id")
    .lean();

  if (!destinationWorkspace) {
    throw new DraftMediaAttachmentError("Workspace not found.", 404);
  }

  if (normalizedIds.length === 0) {
    return [];
  }

  // Derive authorized source workspaces from
  // the authenticated user's ownership.
  //
  // Never accept client-supplied source workspace IDs
  // as proof of authorization.
  const authorizedWorkspaces = await Workspace.find({
    ownerUserId: profile._id,
  })
    .select("_id")
    .lean();

  const authorizedWorkspaceIds = authorizedWorkspaces.map(
    (workspace) => workspace._id,
  );

  // Query only assets belonging to the authenticated
  // user and one of their currently owned workspaces.
  //
  // Eligibility validation happens afterward using
  // the same helper as private image access.
  const assets = await MediaAsset.find({
    _id: {
      $in: normalizedIds.map((id) => new mongoose.Types.ObjectId(id)),
    },
    workspaceId: {
      $in: authorizedWorkspaceIds,
    },
    createdByUserId: profile._id,
    type: "image",
    source: "ai-generated",
    status: "ready",
  })
    .select(
      "_id workspaceId type source status " +
        "storageProvider storageKey mimeType " +
        "width height fileSize idempotencyKey " +
        "generationExecution contentSha256",
    )
    .lean();

  // Reject the complete request if any referenced
  // image is missing, unauthorized, or inconsistent.
  //
  // This deliberately does not reveal which image
  // failed authorization.
  if (
    assets.length !== normalizedIds.length ||
    assets.some((asset) => !isPreviewReadyImage(asset))
  ) {
    throw new DraftMediaAttachmentError(
      "One or more media attachments are unavailable.",
      400,
    );
  }

  return normalizedIds;
}
