import Post from "../models/Post.js";

/**
 * Atomically claims one due scheduled post.
 *
 * The conditional update ensures that only a post that is still scheduled
 * and due can transition to publishing, even if multiple workers run at once.
 */
export async function claimNextDuePost(now: Date = new Date()) {
  return Post.findOneAndUpdate(
    {
      status: "scheduled",
      scheduledAt: { $lte: now },
    },
    {
      $set: {
        status: "publishing",
        claimedAt: now,
      },
      $inc: {
        attemptCount: 1,
      },
    },
    {
      new: true,
      sort: { scheduledAt: 1, _id: 1 },
      runValidators: true,
    },
  )
    .select(
      "_id workspaceId createdByUserId title caption mediaIds platforms status scheduledAt publishedAt claimedAt attemptCount lastError createdAt updatedAt",
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
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Stale claim timeout must be a positive number.");
  }

  const staleBefore = new Date(now.getTime() - timeoutMs);

  return Post.updateMany(
    {
      status: "publishing",
      claimedAt: { $ne: null, $lte: staleBefore },
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
