import type {
  PublishingAdapter,
  PublishingInput,
  PublishingResult,
} from "./publishingAdapter.js";

export class DryRunPublishingAdapter implements PublishingAdapter {
  async publish(input: PublishingInput): Promise<PublishingResult> {
    return {
      outcome: "simulated",
      postId: input.postId,
      platform: input.platform,
      simulatedAt: new Date(),
      message:
        "Dry run completed. No content was sent to the external platform.",
    };
  }
}
