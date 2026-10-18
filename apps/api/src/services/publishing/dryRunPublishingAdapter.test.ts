import { describe, expect, it } from "vitest";
import { DryRunPublishingAdapter } from "./dryRunPublishingAdapter.js";

describe("DryRunPublishingAdapter", () => {
  it("simulates publishing without claiming a post was published", async () => {
    const adapter = new DryRunPublishingAdapter();

    const input = {
      postId: "post-123",
      platform: "facebook" as const,
      caption: "Test post from Storm",
      mediaIds: [],
    };

    const result = await adapter.publish(input);

    expect(result).toMatchObject({
      outcome: "simulated",
      postId: input.postId,
      platform: input.platform,
      message:
        "Dry run completed. No content was sent to the external platform.",
    });

    if (result.outcome === "simulated") {
      expect(result.simulatedAt).toBeInstanceOf(Date);
    }

    expect(result.outcome).not.toBe("published");
  });

  it.each(["facebook", "instagram", "linkedin"] as const)(
    "supports dry-run simulation for %s",
    async (platform) => {
      const adapter = new DryRunPublishingAdapter();

      const result = await adapter.publish({
        postId: "post-456",
        platform,
        caption: "Platform simulation",
        mediaIds: [],
      });

      expect(result.outcome).toBe("simulated");
      expect(result.platform).toBe(platform);
    },
  );
});
