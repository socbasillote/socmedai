import mongoose from "mongoose";
import Post from "../../models/Post.js";
import type { PlatformPublishStatus, PostStatus } from "../../models/Post.js";
import { reconcileOverallPostStatus } from "./publishingCoordinator.js";
import type { ScheduledClaimContext } from "./platformResultService.js";

type ReconciliationPost = {
  _id: mongoose.Types.ObjectId;
  status: PostStatus;
  platforms: Array<"facebook" | "instagram" | "linkedin">;
  platformResults: Array<{
    platform: "facebook" | "instagram" | "linkedin";
    status: PlatformPublishStatus;
    attemptCount: number;
    externalPostId?: string;
    publishedAt?: Date;
    lastError?: string;
  }>;
  scheduledClaimId?: string | null;
  scheduledLeaseExpiresAt?: Date | null;
  scheduledAt?: Date | null;
};

export class PostStatusReconciliationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "PostStatusReconciliationError";
  }
}

export async function reconcilePostStatus(
  postId: string,
  claimContext?: ScheduledClaimContext,
) {
  if (!mongoose.isValidObjectId(postId)) {
    throw new PostStatusReconciliationError("Post not found.", 404);
  }

  const post = (await Post.findById(postId)
    .select(
      "_id status platforms platformResults publishedAt scheduledAt  " +
        "+scheduledClaimId +scheduledLeaseExpiresAt",
    )
    .lean()) as ReconciliationPost | null;

  if (!post) {
    throw new PostStatusReconciliationError("Post not found.", 404);
  }

  if (post.status !== "publishing") {
    throw new PostStatusReconciliationError(
      "Only actively publishing posts can be reconciled by this operation.",
      409,
    );
  }

  // A post with scheduled ownership must not enter the
  // unguarded immediate-publishing reconciliation path.
  const hasScheduledClaim =
    typeof post.scheduledClaimId === "string" &&
    post.scheduledClaimId.trim().length > 0;

  const isScheduledPost = post.scheduledAt instanceof Date;

  if (isScheduledPost && !hasScheduledClaim) {
    throw new PostStatusReconciliationError(
      "Scheduled publishing claim ownership is missing.",
      409,
    );
  }

  if (hasScheduledClaim) {
    if (
      !isScheduledPost ||
      !claimContext ||
      claimContext.scheduledClaimId !== post.scheduledClaimId
    ) {
      throw new PostStatusReconciliationError(
        "Scheduled publishing claim ownership does not match.",
        409,
      );
    }

    if (
      !(post.scheduledLeaseExpiresAt instanceof Date) ||
      !Number.isFinite(post.scheduledLeaseExpiresAt.getTime()) ||
      post.scheduledLeaseExpiresAt.getTime() <= Date.now()
    ) {
      throw new PostStatusReconciliationError(
        "Scheduled publishing lease has expired.",
        409,
      );
    }
  } else if (claimContext) {
    throw new PostStatusReconciliationError(
      "Scheduled claim context was supplied for an immediate post.",
      409,
    );
  }

  const platformResults = post.platformResults ?? [];

  // A missing result for a selected platform must never count as success.
  const statuses: PlatformPublishStatus[] = post.platforms.map(
    (platform) =>
      platformResults.find((result) => result.platform === platform)?.status ??
      "pending",
  );

  const nextStatus: PostStatus = reconcileOverallPostStatus(
    post.status,
    statuses,
  );

  const allPublished =
    post.platforms.length > 0 &&
    statuses.length === post.platforms.length &&
    statuses.every((status) => status === "published");

  const publishedDates = platformResults
    .filter(
      (result) =>
        result.status === "published" &&
        result.publishedAt instanceof Date &&
        Number.isFinite(result.publishedAt.getTime()),
    )
    .map((result) => result.publishedAt!.getTime());

  const latestPublishedAt =
    allPublished && publishedDates.length === post.platforms.length
      ? new Date(Math.max(...publishedDates))
      : undefined;

  const resultSnapshotConditions = platformResults.map((result) => {
    const expectedResult: Record<string, unknown> = {
      platform: result.platform,
      status: result.status,
      attemptCount: result.attemptCount,
    };

    for (const field of [
      "externalPostId",
      "publishedAt",
      "lastError",
    ] as const) {
      const value = result[field];

      expectedResult[field] = value === undefined ? { $exists: false } : value;
    }

    return {
      platformResults: {
        $elemMatch: expectedResult,
      },
    };
  });

  const ownershipFilter: Record<string, unknown> = hasScheduledClaim
    ? {
        scheduledClaimId: claimContext!.scheduledClaimId,
        scheduledAt: { $type: "date" },
        scheduledLeaseExpiresAt: {
          $type: "date",
          $gt: new Date(),
        },
      }
    : {
        scheduledClaimId: null,
        scheduledAt: null,
      };

  // Match the status and complete result snapshot we just inspected.
  // If either changed concurrently, refuse to write a stale reconciliation.
  const updatedPost = await Post.findOneAndUpdate(
    {
      _id: post._id,
      status: post.status,

      ...ownershipFilter,

      platforms: post.platforms,
      platformResults: { $size: platformResults.length },
      ...(resultSnapshotConditions.length > 0
        ? { $and: resultSnapshotConditions }
        : {}),
    },
    {
      $set: {
        status: nextStatus,
        ...(latestPublishedAt ? { publishedAt: latestPublishedAt } : {}),
      },
      ...(!latestPublishedAt ? { $unset: { publishedAt: "" } } : {}),
    },
    {
      returnDocument: "after",
      runValidators: true,
    },
  );

  if (!updatedPost) {
    throw new PostStatusReconciliationError(
      "Post status changed during reconciliation. Reconcile again using the latest data.",
      409,
    );
  }

  return updatedPost;
}
