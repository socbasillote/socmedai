import type { PostPlatform } from "../../models/Post.js";
import {
  claimPlatformResult,
  initializePlatformResults,
  updatePlatformResult,
} from "./platformResultService.js";
import type {
  PublishingAdapter,
  PublishingInput,
  PublishingResult,
} from "./publishingAdapter.js";

import type { ScheduledClaimContext } from "./platformResultService.js";

import { reconcilePostStatus } from "./postStatusReconciliationService.js";

import type { ScheduledLeaseSignal } from "./scheduledPublishingHeartbeat.js";
import { ScheduledLeaseLostError } from "./scheduledPublishingHeartbeat.js";

export type OrchestratorPost = {
  _id: string | { toString(): string };
  workspaceId: string | { toString(): string };
  caption?: string | null;
  mediaIds: Array<string | { toString(): string }>;
  platforms: PostPlatform[];

  platformConnections?: {
    linkedin?: string | { toString(): string };
    facebook?: string | { toString(): string };
  };
  scheduledClaimId?: string | null;
  scheduledLeaseExpiresAt?: Date | null;
};
export type OrchestrationResult = {
  postId: string;
  results: PublishingResult[];
};

export class PublishingOrchestrator {
  constructor(private readonly adapter: PublishingAdapter) {}

  async processPost(
    post: OrchestratorPost,
    claimContext?: ScheduledClaimContext,
    lease?: ScheduledLeaseSignal,
  ): Promise<OrchestrationResult> {
    const postId = String(post._id);
    const caption = post.caption ?? "";
    const mediaIds = post.mediaIds.map((id) => String(id));

    const isScheduledPublishing =
      typeof post.scheduledClaimId === "string" &&
      post.scheduledClaimId.trim().length > 0;

    if (isScheduledPublishing) {
      if (
        !claimContext ||
        claimContext.scheduledClaimId !== post.scheduledClaimId ||
        !lease
      ) {
        throw new Error(
          "Scheduled publishing requires matching claim ownership and an active lease signal.",
        );
      }
    } else if (claimContext || lease) {
      throw new Error(
        "Immediate publishing must not supply scheduled claim ownership.",
      );
    }

    // Reject a scheduled operation if heartbeat has already
    // reported that ownership was lost.
    lease?.assertOwnership();

    const initializedPost = await initializePlatformResults(
      postId,
      post.platforms,
      claimContext,
    );

    const results: PublishingResult[] = [];

    for (const platform of post.platforms) {
      lease?.assertOwnership();
      const claimed = await claimPlatformResult(postId, platform, claimContext);

      if (!claimed) {
        continue;
      }

      const attemptCount = claimed.attemptCount;

      const selectedConnection =
        platform === "linkedin"
          ? post.platformConnections?.linkedin
          : platform === "facebook"
            ? post.platformConnections?.facebook
            : undefined;

      const connectionId = selectedConnection
        ? String(selectedConnection)
        : undefined;

      let result: PublishingResult;

      if (
        (platform === "linkedin" || platform === "facebook") &&
        !connectionId
      ) {
        result = {
          outcome: "failed",
          postId,
          platform,
          message:
            platform === "facebook"
              ? "No Facebook Page was selected for this post."
              : "No LinkedIn account was selected for this post.",
        };
      } else {
        try {
          const input: PublishingInput =
            platform === "linkedin"
              ? {
                  postId,
                  workspaceId: String(post.workspaceId),
                  platform: "linkedin",
                  connectionId: connectionId!,
                  caption,
                  mediaIds,
                }
              : {
                  postId,
                  workspaceId: String(post.workspaceId),
                  platform,

                  ...(platform === "facebook" && connectionId
                    ? { connectionId }
                    : {}),

                  caption,
                  mediaIds,
                };

          // Last cooperative cancellation point before external publishing.
          lease?.assertOwnership();

          result = await this.adapter.publish(input);

          if (result.postId !== postId || result.platform !== platform) {
            result = {
              outcome: "unknown",
              postId,
              platform,
              message:
                "Publishing adapter returned a mismatched result; external outcome is unknown.",
            };
          } else if (
            result.outcome === "published" &&
            (typeof result.externalPostId !== "string" ||
              result.externalPostId.trim().length === 0 ||
              !(result.publishedAt instanceof Date) ||
              !Number.isFinite(result.publishedAt.getTime()))
          ) {
            result = {
              outcome: "unknown",
              postId,
              platform,
              message:
                "Publishing adapter returned an invalid publication confirmation; external outcome is unknown.",
            };
          }
        } catch (error) {
          if (error instanceof ScheduledLeaseLostError) {
            throw error;
          }
          result = {
            outcome: "unknown",
            postId,
            platform,
            message: "Publishing outcome is unknown after an unexpected error.",
          };
        }
      }

      lease?.assertOwnership();

      switch (result.outcome) {
        case "published":
          await updatePlatformResult(
            postId,
            {
              platform,
              status: "published",
              externalPostId: result.externalPostId,
              publishedAt: result.publishedAt,
              attemptCount,
            },
            claimContext,
          );
          break;

        case "failed":
          await updatePlatformResult(
            postId,
            {
              platform,
              status: "failed",
              lastError: result.message,
              attemptCount,
            },
            claimContext,
          );
          break;

        case "unknown":
          await updatePlatformResult(
            postId,
            {
              platform,
              status: "unknown",
              lastError: result.message,
              attemptCount,
            },
            claimContext,
          );
          break;

        case "simulated":
          await updatePlatformResult(
            postId,
            {
              platform,
              status: "simulated",
              lastError: result.message,
              attemptCount,
            },
            claimContext,
          );
          break;
      }

      results.push(result);
    }

    await reconcilePostStatus(postId, claimContext);

    return { postId, results };
  }
}
