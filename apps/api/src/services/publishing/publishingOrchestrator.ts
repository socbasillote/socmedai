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

import { reconcilePostStatus } from "./postStatusReconciliationService.js";

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
};
export type OrchestrationResult = {
  postId: string;
  results: PublishingResult[];
};

export class PublishingOrchestrator {
  constructor(private readonly adapter: PublishingAdapter) {}

  async processPost(post: OrchestratorPost): Promise<OrchestrationResult> {
    const postId = String(post._id);
    const caption = post.caption ?? "";
    const mediaIds = post.mediaIds.map((id) => String(id));

    const initializedPost = await initializePlatformResults(
      postId,
      post.platforms,
    );

    const results: PublishingResult[] = [];

    for (const platform of post.platforms) {
      const claimed = await claimPlatformResult(postId, platform);

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

      if (platform === "linkedin" && !connectionId) {
        result = {
          outcome: "failed",
          postId,
          platform,
          message: "No LinkedIn account was selected for this post.",
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
        } catch {
          result = {
            outcome: "unknown",
            postId,
            platform,
            message: "Publishing outcome is unknown after an unexpected error.",
          };
        }
      }
      switch (result.outcome) {
        case "published":
          await updatePlatformResult(postId, {
            platform,
            status: "published",
            externalPostId: result.externalPostId,
            publishedAt: result.publishedAt,
            attemptCount,
          });
          break;

        case "failed":
          await updatePlatformResult(postId, {
            platform,
            status: "failed",
            lastError: result.message,
            attemptCount,
          });
          break;

        case "unknown":
          await updatePlatformResult(postId, {
            platform,
            status: "unknown",
            lastError: result.message,
            attemptCount,
          });
          break;

        case "simulated":
          await updatePlatformResult(postId, {
            platform,
            status: "simulated",
            lastError: result.message,
            attemptCount,
          });
          break;
      }

      results.push(result);
    }

    await reconcilePostStatus(postId);

    return { postId, results };
  }
}
