import Post from "../../models/Post.js";

import { getUserWorkspaceById } from "../workspaceService.js";

import { resolveScheduledPublishingIdentity } from "./scheduledPublishingIdentityService.js";

import { PublishingOrchestrator } from "./publishingOrchestrator.js";

import { createPublishingAdapter } from "./publishingAdapterFactory.js";

import { FacebookPublishingAdapter } from "./facebookPublishingAdapter.js";

import type { ScheduledLeaseSignal } from "./scheduledPublishingHeartbeat.js";

import {
  recordScheduledPreDispatchFailure,
  recordScheduledInterruptedPublishing,
} from "./scheduledPublishingFailureService.js";

export class ScheduledPublishingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScheduledPublishingError";
  }
}

/**
 * Records a failure before any external publishing
 * operation has been started.
 *
 * Never use this after the orchestrator is invoked,
 * because an external publishing request may have
 * succeeded even if the response was lost.
 */
async function recordPreDispatchFailure(
  postId: string,
  message: string,
): Promise<void> {
  const result = await Post.updateOne(
    {
      _id: postId,
      status: "publishing",
      attemptCount: 1,
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

  if (result.modifiedCount !== 1) {
    console.warn(
      "[scheduled-publishing] Could not record pre-dispatch failure:",
      postId,
    );
  }
}

/**
 * Dispatches a post already claimed by the scheduled worker.
 *
 * Does NOT:
 * - Claim posts
 * - Reset publishing attempts
 * - Retry external publishing
 * - Bypass workspace authorization
 */
export async function dispatchScheduledPost(
  postId: string,
  lease: ScheduledLeaseSignal,
) {
  let externalPublishingMayHaveStarted = false;
  let verifiedClaimId: string | null = null;

  try {
    lease.assertOwnership();
    // 1. Load the claimed post.
    const post = await Post.findById(postId)
      .select(
        [
          "_id",
          "workspaceId",
          "createdByUserId",
          "caption",
          "mediaIds",
          "platforms",
          "platformConnections",
          "status",
          "scheduledAt",
          "claimedAt",
          "attemptCount",
          "+scheduledClaimId",
          "+scheduledLeaseExpiresAt",
        ].join(" "),
      )
      .lean();

    if (!post) {
      throw new ScheduledPublishingError("Scheduled post not found.");
    }

    lease.assertOwnership();

    if (
      post.status !== "publishing" ||
      !post.scheduledAt ||
      !post.claimedAt ||
      post.attemptCount !== 1
    ) {
      throw new ScheduledPublishingError(
        "Post is not eligible for scheduled publishing dispatch.",
      );
    }

    lease.assertOwnership();

    if (
      typeof post.scheduledClaimId !== "string" ||
      !post.scheduledClaimId.trim() ||
      !(post.scheduledLeaseExpiresAt instanceof Date) ||
      !Number.isFinite(post.scheduledLeaseExpiresAt.getTime()) ||
      post.scheduledLeaseExpiresAt.getTime() <= Date.now()
    ) {
      throw new ScheduledPublishingError(
        "Scheduled publishing claim ownership is missing or expired.",
      );
    }

    verifiedClaimId = post.scheduledClaimId;

    // 2. Validate publishing platform.
    if (
      post.platforms.length !== 1 ||
      !["facebook", "linkedin"].includes(post.platforms[0])
    ) {
      throw new ScheduledPublishingError(
        "Scheduled publishing supports one Facebook or LinkedIn destination.",
      );
    }

    const platform = post.platforms[0];

    // 3. Keep media publishing disabled.
    if (post.mediaIds.length > 0) {
      throw new ScheduledPublishingError(
        "Scheduled media publishing is not supported yet.",
      );
    }

    if (typeof post.caption !== "string" || !post.caption.trim()) {
      throw new ScheduledPublishingError("Scheduled post caption is required.");
    }

    // 4. Require an explicitly saved connection.
    const connectionId =
      platform === "facebook"
        ? post.platformConnections?.facebook
        : post.platformConnections?.linkedin;

    if (!connectionId) {
      throw new ScheduledPublishingError(
        `No ${platform} publishing connection was selected.`,
      );
    }

    // 5. Resolve original creator identity.
    const authUser = await resolveScheduledPublishingIdentity(
      String(post.createdByUserId),
    );

    const workspaceId = String(post.workspaceId);

    // 6. Verify workspace access.
    const workspace = await getUserWorkspaceById(authUser, workspaceId);

    if (!workspace) {
      throw new ScheduledPublishingError(
        "The post creator no longer has workspace access.",
      );
    }

    lease.assertOwnership();

    // 7. Build the platform adapter.
    const adapter = createPublishingAdapter(authUser, {
      facebook: {
        enabled: process.env.FACEBOOK_PUBLISHING_ENABLED === "true",
        adapter: new FacebookPublishingAdapter(authUser, fetch),
      },
    });

    const orchestrator = new PublishingOrchestrator(adapter);
    lease.assertOwnership();

    // From this point onward, do not classify an
    // unexpected exception as a definite failure.
    externalPublishingMayHaveStarted = true;

    return await orchestrator.processPost(
      post,
      {
        scheduledClaimId: post.scheduledClaimId,
      },
      lease,
    );
  } catch (error) {
    if (lease.ownershipLost) {
      console.error(
        "[scheduled-post-worker] Dispatch stopped after lease ownership loss.",
        {
          postId,
          reason: lease.lossReason,
        },
      );

      // Do not change status, reset the claim,
      // or start another publication attempt.
      // Lease-aware recovery handles unresolved claims.
      throw error;
    }

    if (!externalPublishingMayHaveStarted) {
      const message =
        error instanceof ScheduledPublishingError
          ? error.message
          : "Scheduled publishing could not be prepared safely.";

      if (verifiedClaimId) {
        try {
          const recorded = await recordScheduledPreDispatchFailure(
            {
              postId,
              scheduledClaimId: verifiedClaimId,
            },
            message,
          );

          if (!recorded) {
            console.warn(
              "[scheduled-publishing] Pre-dispatch failure was not recorded; " +
                "claim ownership may have changed or expired.",
              { postId },
            );
          }
        } catch (persistenceError) {
          console.error(
            "[scheduled-publishing] Failed to persist pre-dispatch failure:",
            persistenceError,
          );
        }
      } else {
        console.warn(
          "[scheduled-publishing] No verified scheduled claim. " +
            "Failure requires recovery or manual investigation.",
          { postId },
        );
      }

      throw new ScheduledPublishingError(message);
    }

    // An exception after the orchestrator begins
    // does not prove that Facebook or LinkedIn
    // rejected the publication.
    console.error(
      "[scheduled-publishing] Publishing execution interrupted:",
      error,
    );

    if (verifiedClaimId) {
      try {
        const recorded = await recordScheduledInterruptedPublishing({
          postId,
          scheduledClaimId: verifiedClaimId,
        });

        if (!recorded) {
          console.warn(
            "[scheduled-publishing] Interrupted outcome could not be recorded " +
              "because claim ownership changed or expired.",
            { postId },
          );
        }
      } catch (persistenceError) {
        console.error(
          "[scheduled-publishing] Failed to record interrupted publishing:",
          persistenceError,
        );
      }
    }

    throw new ScheduledPublishingError(
      "Scheduled publishing outcome is uncertain. " +
        "Check the destination before attempting another publication.",
    );
  }
}
