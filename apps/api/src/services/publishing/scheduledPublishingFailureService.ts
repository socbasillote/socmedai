import Post from "../../models/Post.js";

export type ScheduledFailureOwnership = {
  postId: string;
  scheduledClaimId: string;
};

/**
 * Marks a scheduled publishing attempt as failed only
 * when the worker still owns an active claim.
 *
 * This must NEVER be called after an external request
 * may have started.
 */
export async function recordScheduledPreDispatchFailure(
  ownership: ScheduledFailureOwnership,
  message: string,
): Promise<boolean> {
  const result = await Post.updateOne(
    {
      _id: ownership.postId,
      status: "publishing",
      attemptCount: 1,
      scheduledAt: { $type: "date" },
      scheduledClaimId: ownership.scheduledClaimId,
      scheduledLeaseExpiresAt: {
        $gt: new Date(),
      },
    },
    {
      $set: {
        status: "failed",
        lastError: message,
      },
    },
    {
      runValidators: true,
    },
  );

  return result.modifiedCount === 1;
}

/**
 * Records an uncertain outcome without changing the
 * overall publishing status or allowing another attempt.
 *
 * The update is refused if ownership has changed
 * or the lease has expired.
 */
export async function recordScheduledInterruptedPublishing(
  ownership: ScheduledFailureOwnership,
): Promise<boolean> {
  const result = await Post.updateOne(
    {
      _id: ownership.postId,
      status: "publishing",
      attemptCount: 1,
      scheduledAt: { $type: "date" },
      scheduledClaimId: ownership.scheduledClaimId,
      scheduledLeaseExpiresAt: {
        $gt: new Date(),
      },
    },
    {
      $set: {
        lastError:
          "Scheduled publishing was interrupted. " +
          "The external publishing outcome may be unknown. " +
          "Do not retry automatically.",
      },
    },
    {
      runValidators: true,
    },
  );

  return result.modifiedCount === 1;
}
