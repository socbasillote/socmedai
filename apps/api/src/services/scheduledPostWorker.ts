import Post from "../models/Post.js";
import { randomUUID } from "node:crypto";

const SCHEDULED_LEASE_MS = 15 * 60 * 1000;

/**
 * Atomically claims one due scheduled post.
 *
 * The conditional update ensures that only a post that is still scheduled
 * and due can transition to publishing, even if multiple workers run at once.
 */
export async function claimNextDuePost(now: Date = new Date()) {
  const scheduledClaimId = randomUUID();

  const scheduledLeaseExpiresAt = new Date(now.getTime() + SCHEDULED_LEASE_MS);

  return Post.findOneAndUpdate(
    {
      status: "scheduled",
      scheduledAt: { $lte: now },

      // First publishing attempt only.
      $and: [
        {
          $or: [{ attemptCount: 0 }, { attemptCount: { $exists: false } }],
        },
        {
          $or: [
            {
              platforms: ["facebook"],
              "platformConnections.facebook": {
                $exists: true,
                $ne: null,
              },
            },
            {
              platforms: ["linkedin"],
              "platformConnections.linkedin": {
                $exists: true,
                $ne: null,
              },
            },
          ],
        },
      ],

      // Scheduled publishing currently supports text only.
      mediaIds: { $size: 0 },
    },
    {
      $set: {
        status: "publishing",
        claimedAt: now,
        scheduledClaimId,
        scheduledLeaseExpiresAt,
      },
      $inc: {
        attemptCount: 1,
      },
    },
    {
      returnDocument: "after",
      sort: { scheduledAt: 1, _id: 1 },
      runValidators: true,
    },
  )
    .select(
      [
        "_id",
        "workspaceId",
        "createdByUserId",
        "title",
        "caption",
        "mediaIds",
        "platforms",
        "platformConnections",
        "platformResults",
        "status",
        "scheduledAt",
        "publishedAt",
        "claimedAt",
        "attemptCount",
        "lastError",
        "createdAt",
        "updatedAt",
        "+scheduledClaimId",
        "+scheduledLeaseExpiresAt",
      ].join(" "),
    )
    .lean();
}

const DEFAULT_STALE_CLAIM_TIMEOUT_MS = 15 * 60 * 1000;

const STALE_CLAIM_ERROR =
  "Publishing claim expired before completion. Automatic retry was withheld because the publishing outcome is unknown.";

export async function recoverStalePublishingPosts(
  now: Date = new Date(),
  timeoutMs: number = DEFAULT_STALE_CLAIM_TIMEOUT_MS,
) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("Recovery time must be a valid Date.");
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Stale claim timeout must be a positive number.");
  }

  const staleBefore = new Date(now.getTime() - timeoutMs);

  return Post.updateMany(
    {
      status: "publishing",

      $or: [
        // Scheduled posts with an ownership lease:
        // recover only when that lease has expired.
        {
          scheduledClaimId: {
            $type: "string",
            $ne: "",
          },
          scheduledLeaseExpiresAt: {
            $type: "date",
            $lte: now,
          },
        },

        // Legacy and immediate publishing attempts
        // without a scheduled claim ID:
        // preserve the original claimedAt timeout.
        {
          scheduledClaimId: null,
          claimedAt: {
            $ne: null,
            $lte: staleBefore,
          },
        },
      ],
    },
    {
      $set: {
        status: "failed",
        lastError: STALE_CLAIM_ERROR,
      },
    },
    {
      runValidators: true,
    },
  );
}
