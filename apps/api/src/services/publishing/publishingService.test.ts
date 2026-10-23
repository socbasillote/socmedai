import { describe, expect, it, vi } from "vitest";
import type { PublishingAdapter } from "./publishingAdapter.js";
import { PublishingService } from "./publishingService.js";

describe("PublishingService", () => {
  it("processes each configured platform", async () => {
    const publish = vi.fn(async (input) => ({
      outcome: "simulated" as const,
      postId: input.postId,
      platform: input.platform,
      simulatedAt: new Date(),
      message: "Dry run completed.",
    }));

    const service = new PublishingService({
      publish,
    } satisfies PublishingAdapter);

    const result = await service.processPost({
      _id: "post-123",
      workspaceId: "workspace-123",
      caption: "Test caption",
      mediaIds: ["media-1"],
      platforms: ["facebook", "instagram"],
    });

    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenNthCalledWith(1, {
      postId: "post-123",
      workspaceId: "workspace-123",
      platform: "facebook",
      caption: "Test caption",
      mediaIds: ["media-1"],
    });
    expect(publish).toHaveBeenNthCalledWith(2, {
      postId: "post-123",
      workspaceId: "workspace-123",
      platform: "instagram",
      caption: "Test caption",
      mediaIds: ["media-1"],
    });
    expect(result.results).toHaveLength(2);
    expect(result.results.every((item) => item.outcome === "simulated")).toBe(
      true,
    );
  });

  it("continues processing platforms when one adapter call throws", async () => {
    const publish = vi
      .fn<PublishingAdapter["publish"]>()
      .mockRejectedValueOnce(new Error("Temporary adapter error"))
      .mockResolvedValueOnce({
        outcome: "simulated",
        postId: "post-456",
        platform: "instagram",
        simulatedAt: new Date(),
        message: "Dry run completed.",
      });

    const service = new PublishingService({
      publish,
    } satisfies PublishingAdapter);

    const result = await service.processPost({
      _id: "post-456",
      workspaceId: "workspace-123",
      caption: "Another test",
      mediaIds: [],
      platforms: ["facebook", "instagram"],
    });

    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toMatchObject({
      outcome: "unknown",
      platform: "facebook",
      message: "Publishing outcome is unknown after an unexpected error.",
    });
    expect(result.results[1].outcome).toBe("simulated");
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it("returns an empty result when no platforms are configured", async () => {
    const publish = vi.fn<PublishingAdapter["publish"]>();
    const service = new PublishingService({ publish });

    const result = await service.processPost({
      _id: "post-789",
      workspaceId: "workspace-123",
      caption: "",
      mediaIds: [],
      platforms: [],
    });

    expect(result).toEqual({
      postId: "post-789",
      results: [],
    });
    expect(publish).not.toHaveBeenCalled();
  });

  it("rejects an adapter result for a different post", async () => {
    const publish = vi.fn<PublishingAdapter["publish"]>().mockResolvedValue({
      outcome: "simulated",
      postId: "different-post",
      platform: "facebook",
      simulatedAt: new Date(),
      message: "Dry run completed.",
    });

    const service = new PublishingService({ publish });

    const result = await service.processPost({
      _id: "post-123",
      workspaceId: "workspace-123",
      caption: "Test caption",
      mediaIds: [],
      platforms: ["facebook"],
    });

    expect(result.results).toEqual([
      {
        outcome: "failed",
        postId: "post-123",
        platform: "facebook",
        message: "Publishing adapter returned a mismatched result.",
      },
    ]);
  });

  it("rejects an adapter result for a different platform", async () => {
    const publish = vi.fn<PublishingAdapter["publish"]>().mockResolvedValue({
      outcome: "simulated",
      postId: "post-123",
      platform: "linkedin",
      simulatedAt: new Date(),
      message: "Dry run completed.",
    });

    const service = new PublishingService({ publish });

    const result = await service.processPost({
      _id: "post-123",
      workspaceId: "workspace-123",
      caption: "Test caption",
      mediaIds: [],
      platforms: ["facebook"],
    });

    expect(result.results).toEqual([
      {
        outcome: "failed",
        postId: "post-123",
        platform: "facebook",
        message: "Publishing adapter returned a mismatched result.",
      },
    ]);
  });
});
