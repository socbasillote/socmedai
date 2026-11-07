import mongoose from "mongoose";

import UserProfile from "../models/UserProfile.js";
import Workspace from "../models/Workspace.js";

import {
  UserCreditWallet,
  ImageDailyUsage,
  ImageWorkspaceCapacity,
} from "../models/ImageGenerationAccounting.js";

import { getWorkspaceMediaAsset } from "./mediaAssetService.js";

import {
  utcUsageDay,
  IMAGE_CREDIT_COST,
} from "./imageGenerationAdmissionService.js";

import type { AuthenticatedUser } from "./userProfileService.js";

import type { ImageGenerationConfig } from "../config/imageGenerationConfig.js";

export class ImageGenerationApiQueryError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "ImageGenerationApiQueryError";
  }
}

async function authorizeWorkspace(
  authUser: AuthenticatedUser,
  workspaceId: string,
) {
  if (!mongoose.isObjectIdOrHexString(workspaceId)) {
    throw new ImageGenerationApiQueryError("Workspace not found.", 404);
  }

  const profile = await UserProfile.findOne({
    supabaseUserId: authUser.id,
  }).select("_id");

  const workspace = profile
    ? await Workspace.findOne({
        _id: workspaceId,
        ownerUserId: profile._id,
      }).select("_id")
    : null;

  if (!profile || !workspace) {
    throw new ImageGenerationApiQueryError("Workspace not found.", 404);
  }

  return { profile, workspace };
}

export async function getImageGenerationCredits(
  authUser: AuthenticatedUser,
  workspaceId: string,
  config: ImageGenerationConfig,
) {
  const { profile, workspace } = await authorizeWorkspace(
    authUser,
    workspaceId,
  );

  const dayUtc = utcUsageDay();

  const [wallet, daily, capacity] = await Promise.all([
    UserCreditWallet.findOne({
      userId: profile._id,
    })
      .select("balance")
      .lean(),

    ImageDailyUsage.findOne({
      workspaceId: workspace._id,
      dayUtc,
    })
      .select("attempts")
      .lean(),

    ImageWorkspaceCapacity.findOne({
      workspaceId: workspace._id,
    })
      .select("active")
      .lean(),
  ]);

  return {
    credits: {
      available: wallet?.balance ?? 0,
      costPerImage: IMAGE_CREDIT_COST,
    },
    usage: {
      dayUtc,
      attempts: daily?.attempts ?? 0,
      dailyLimit: config.IMAGE_GENERATION_DAILY_WORKSPACE_LIMIT,

      active: capacity?.active ?? 0,
      maxActive: config.IMAGE_GENERATION_MAX_ACTIVE_WORKSPACE,
    },
  };
}

export async function getImageGenerationStatus(
  authUser: AuthenticatedUser,
  workspaceId: string,
  assetId: string,
) {
  if (!mongoose.isObjectIdOrHexString(assetId)) {
    throw new ImageGenerationApiQueryError("Image not found.", 404);
  }

  const asset = await getWorkspaceMediaAsset(authUser, workspaceId, assetId);

  // Legacy or non-generation assets must not be
  // represented as new generation operations.
  if (!asset.idempotencyKey || !asset.generationExecution) {
    throw new ImageGenerationApiQueryError("Image generation not found.", 404);
  }

  const status = asset.status;

  const state =
    status === "ready"
      ? "ready"
      : status === "failed"
        ? "failed"
        : asset.generationExecution.phase === "recovery_required"
          ? "action_required"
          : "processing";

  return {
    assetId: String(asset._id),
    status,
    state,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,

    ...(status === "ready"
      ? {
          image: {
            width: asset.width,
            height: asset.height,
            mimeType: asset.mimeType,
          },
        }
      : {}),
  };
}
