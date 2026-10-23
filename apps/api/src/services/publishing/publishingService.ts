import type {
  PublishingAdapter,
  PublishingInput,
  PublishingPlatform,
  PublishingResult,
} from "./publishingAdapter.js";

export type PublishingPost = {
  _id: string | { toString(): string };
  workspaceId: string | { toString(): string };
  caption?: string | null;
  mediaIds: Array<string | { toString(): string }>;
  platforms: PublishingPlatform[];

  platformConnections?: {
    linkedin?: string | { toString(): string };
  };
};

export type ProcessPostResult = {
  postId: string;
  results: PublishingResult[];
};

export class PublishingService {
  constructor(private readonly adapter: PublishingAdapter) {}

  async processPost(post: PublishingPost): Promise<ProcessPostResult> {
    const postId = String(post._id);
    const caption = post.caption ?? "";
    const mediaIds = post.mediaIds.map((id) => String(id));

    const results: PublishingResult[] = [];

    for (const platform of post.platforms) {
      const connectionId = post.platformConnections?.linkedin
        ? String(post.platformConnections.linkedin)
        : undefined;

      if (platform === "linkedin" && !connectionId) {
        results.push({
          outcome: "failed",
          postId,
          platform,
          message: "No LinkedIn account was selected for this post.",
        });

        continue;
      }

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
              caption,
              mediaIds,
            };

      try {
        const result = await this.adapter.publish(input);

        if (result.postId !== postId || result.platform !== platform) {
          results.push({
            outcome: "failed",
            postId,
            platform,
            message: "Publishing adapter returned a mismatched result.",
          });
          continue;
        }

        results.push(result);
      } catch {
        results.push({
          outcome: "unknown",
          postId,
          platform,
          message: "Publishing outcome is unknown after an unexpected error.",
        });
      }
    }

    return { postId, results };
  }
}
