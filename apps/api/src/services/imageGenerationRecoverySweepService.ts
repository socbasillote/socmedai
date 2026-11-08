import mongoose from "mongoose";

import MediaAsset from "../models/MediaAsset.js";
import UserProfile from "../models/UserProfile.js";

import { ImageGenerationAdmission } from "../models/ImageGenerationAccounting.js";

import { reconcileVerifiedImageGeneration } from "./media/mediaGenerationReconciliationService.js";

import {
  getPrivateImageBucket,
  type ImageStorageBucket,
} from "./media/supabaseImageStorage.js";

import { reconcileTerminalImageCapacity } from "./imageGenerationCapacityReconciliationService.js";

import type { AuthenticatedUser } from "./userProfileService.js";

type RecoveryCandidate = {
  _id: mongoose.Types.ObjectId;
  workspaceId: mongoose.Types.ObjectId;
  createdByUserId: mongoose.Types.ObjectId;
};

export type RecoverySweepResult = {
  inspected: number;
  verifiedReady: number;
  needsReview: number;
  capacityReleased: number;
};

/**
 * Process only expired post-provider operations
 * or already-flagged recovery operations.
 *
 * Never selects reserved/claimed jobs.
 */
export async function runImageGenerationRecoverySweep(
  bucket: ImageStorageBucket = getPrivateImageBucket(),
  limit = 20,
): Promise<RecoverySweepResult> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid image recovery batch size.");
  }

  const now = new Date();

  const candidates = await MediaAsset.aggregate<RecoveryCandidate>([
    {
      $match: {
        status: "pending",
        $or: [
          {
            "generationExecution.phase": {
              $in: ["provider_started", "storage_pending"],
            },
            "generationExecution.leaseExpiresAt": {
              $lte: now,
            },
          },
          {
            "generationExecution.phase": "recovery_required",
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
              state: "active",
              $expr: {
                $and: [
                  {
                    $eq: ["$assetId", "$$assetId"],
                  },
                  {
                    $eq: ["$workspaceId", "$$workspaceId"],
                  },
                  {
                    $eq: ["$userId", "$$userId"],
                  },
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

  let verifiedReady = 0;
  let needsReview = 0;

  for (const candidate of candidates) {
    try {
      const profile = await UserProfile.findById(candidate.createdByUserId)
        .select("supabaseUserId")
        .lean();

      if (!profile?.supabaseUserId) {
        needsReview++;
        continue;
      }

      const authUser = {
        id: profile.supabaseUserId,
      } as AuthenticatedUser;

      const result = await reconcileVerifiedImageGeneration(
        {
          authUser,
          workspaceId: String(candidate.workspaceId),
          assetId: String(candidate._id),
        },
        bucket,
      );

      if (result.outcome === "verified_ready") {
        verifiedReady++;
      } else if (result.outcome === "manual_review_required") {
        needsReview++;
      }
    } catch {
      needsReview++;
    }
  }

  // Release slots from all terminal operations,
  // including those finalized before this sweep.
  const capacity = await reconcileTerminalImageCapacity(limit);

  return {
    inspected: candidates.length,
    verifiedReady,
    needsReview,
    capacityReleased: capacity.filter((item) => item.outcome === "released")
      .length,
  };
}
