import Post from "../../models/Post.js";

import { getUserWorkspaceById } from "../workspaceService.js";

import { resolveScheduledPublishingIdentity } from "./scheduledPublishingIdentityService.js";

import { PublishingOrchestrator } from "./publishingOrchestrator.js";

import { createPublishingAdapter } from "./publishingAdapterFactory.js";

import { FacebookPublishingAdapter } from "./facebookPublishingAdapter.js";

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
export async function dispatchScheduledPost(postId: string) {
  let externalPublishingMayHaveStarted = false;

  try {
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

    // 7. Build the platform adapter.
    const adapter = createPublishingAdapter(authUser, {
      facebook: {
        enabled: process.env.FACEBOOK_PUBLISHING_ENABLED === "true",
        adapter: new FacebookPublishingAdapter(authUser, fetch),
      },
    });

    const orchestrator = new PublishingOrchestrator(adapter);

    // From this point onward, do not classify an
    // unexpected exception as a definite failure.
    externalPublishingMayHaveStarted = true;

    return await orchestrator.processPost(post, {
      scheduledClaimId: post.scheduledClaimId,
    });
  } catch (error) {
    if (!externalPublishingMayHaveStarted) {
      const message =
        error instanceof ScheduledPublishingError
          ? error.message
          : "Scheduled publishing could not be prepared safely.";

      try {
        await recordPreDispatchFailure(postId, message);
      } catch (persistenceError) {
        console.error(
          "[scheduled-publishing] Failed to record pre-dispatch failure:",
          persistenceError,
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

    try {
      await Post.updateOne(
        {
          _id: postId,
          status: "publishing",
        },
        {
          $set: {
            lastError:
              "Scheduled publishing was interrupted. " +
              "The external publishing outcome may be unknown. " +
              "Do not retry automatically.",
          },
        },
      );
    } catch (persistenceError) {
      console.error(
        "[scheduled-publishing] Failed to record interrupted publishing:",
        persistenceError,
      );
    }

    throw new ScheduledPublishingError(
      "Scheduled publishing outcome is uncertain. " +
        "Check the destination before attempting another publication.",
    );
  }
}
