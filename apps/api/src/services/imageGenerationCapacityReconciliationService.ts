import mongoose from "mongoose";

import MediaAsset from "../models/MediaAsset.js";
import UserProfile from "../models/UserProfile.js";

import { ImageGenerationAdmission } from "../models/ImageGenerationAccounting.js";

import { releaseImageGenerationCapacity } from "./imageGenerationAdmissionService.js";

import type { AuthenticatedUser } from "./userProfileService.js";

export class ImageCapacityReconciliationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "ImageCapacityReconciliationError";
  }
}

type TerminalAdmission = {
  assetId: mongoose.Types.ObjectId;
  workspaceId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
};

export type CapacityRepairResult = {
  assetId: string;
  outcome: "released" | "already_released" | "manual_review_required";
};

/**
 * Find active admission records with a matching
 * terminal ready/failed MediaAsset.
 *
 * An active provider or recovery-required job
 * must not be released by this scan.
 */
export async function discoverTerminalAdmissions(
  limit = 20,
): Promise<TerminalAdmission[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new ImageCapacityReconciliationError(
      "Invalid reconciliation batch size.",
      400,
    );
  }

  return ImageGenerationAdmission.aggregate<TerminalAdmission>([
    {
      $match: {
        state: "active",
      },
    },
    { $sort: { createdAt: 1, _id: 1 } },
    {
      $lookup: {
        from: MediaAsset.collection.name,
        let: {
          assetId: "$assetId",
          workspaceId: "$workspaceId",
          userId: "$userId",
        },
        pipeline: [
          {
            $match: {
              status: {
                $in: ["ready", "failed"],
              },
              $expr: {
                $and: [
                  { $eq: ["$_id", "$$assetId"] },
                  {
                    $eq: ["$workspaceId", "$$workspaceId"],
                  },
                  {
                    $eq: ["$createdByUserId", "$$userId"],
                  },
                ],
              },
            },
          },
          { $limit: 1 },
        ],
        as: "asset",
      },
    },
    {
      $match: {
        "asset.0": { $exists: true },
      },
    },
    { $limit: limit },
    {
      $project: {
        _id: 0,
        assetId: 1,
        workspaceId: 1,
        userId: 1,
      },
    },
  ]);
}

/**
 * Repair one batch without changing credits.
 *
 * The underlying release service performs a
 * transaction and changes an active admission
 * to released at most once.
 */
export async function reconcileTerminalImageCapacity(
  limit = 20,
): Promise<CapacityRepairResult[]> {
  const admissions = await discoverTerminalAdmissions(limit);

  const results: CapacityRepairResult[] = [];

  for (const admission of admissions) {
    const assetId = String(admission.assetId);

    try {
      const profile = await UserProfile.findById(admission.userId)
        .select("supabaseUserId")
        .lean();

      if (
        !profile ||
        typeof profile.supabaseUserId !== "string" ||
        !profile.supabaseUserId
      ) {
        results.push({
          assetId,
          outcome: "manual_review_required",
        });
        continue;
      }

      const authUser = {
        id: profile.supabaseUserId,
      } as AuthenticatedUser;

      const released = await releaseImageGenerationCapacity(
        authUser,
        String(admission.workspaceId),
        assetId,
      );

      results.push({
        assetId,
        outcome: released ? "released" : "already_released",
      });
    } catch {
      // Never decrement capacity manually.
      // Leave the admission active so another
      // reconciliation pass can retry safely.
      results.push({
        assetId,
        outcome: "manual_review_required",
      });
    }
  }

  return results;
}
