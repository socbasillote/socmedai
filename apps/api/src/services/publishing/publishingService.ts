import type {
  PublishingAdapter,
  PublishingInput,
  PublishingPlatform,
  PublishingResult,
} from "./publishingAdapter.js";

export type PublishingPost = {
  _id: string | { toString(): string };
  caption?: string | null;
  mediaIds: Array<string | { toString(): string }>;
  platforms: PublishingPlatform[];
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
      const input: PublishingInput = {
        postId,
        platform,
        caption,
        mediaIds,
      };

      try {
        const result = await this.adapter.publish(input);
        results.push(result);
      } catch {
        results.push({
          outcome: "failed",
          postId,
          platform,
          message: "Publishing adapter threw an unexpected error.",
        });
      }
    }

    return { postId, results };
  }
}
