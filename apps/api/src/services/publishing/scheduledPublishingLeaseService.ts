import Post from "../../models/Post.js";

export const SCHEDULED_LEASE_DURATION_MS = 15 * 60 * 1000;

export type RenewScheduledPublishingLeaseInput = {
  postId: string;
  scheduledClaimId: string;
  now?: Date;
};

/**
 * Renews an active scheduled publishing lease.
 *
 * Renewal succeeds only when:
 * - The post is still publishing.
 * - The supplied claim ID owns the post.
 * - The existing lease has not expired.
 *
 * This service does not claim, dispatch, or publish posts.
 */
export async function renewScheduledPublishingLease({
  postId,
  scheduledClaimId,
  now = new Date(),
}: RenewScheduledPublishingLeaseInput): Promise<boolean> {
  if (typeof postId !== "string" || !/^[a-fA-F0-9]{24}$/.test(postId)) {
    return false;
  }

  if (typeof scheduledClaimId !== "string" || !scheduledClaimId.trim()) {
    return false;
  }

  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    return false;
  }

  const nextExpiration = new Date(now.getTime() + SCHEDULED_LEASE_DURATION_MS);

  const result = await Post.updateOne(
    {
      _id: postId,
      status: "publishing",
      scheduledClaimId,

      // An expired lease cannot be renewed.
      scheduledLeaseExpiresAt: {
        $gt: now,
      },
    },
    {
      $set: {
        scheduledLeaseExpiresAt: nextExpiration,
      },
    },
    {
      runValidators: true,
    },
  );

  return result.matchedCount === 1;
}
