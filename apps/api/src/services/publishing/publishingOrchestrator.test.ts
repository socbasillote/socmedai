import { beforeEach, describe, expect, it, vi } from "vitest";

const { claimMock, initializeMock, updateMock, reconcileMock } = vi.hoisted(
  () => ({
    claimMock: vi.fn(),
    initializeMock: vi.fn(),
    updateMock: vi.fn(),
    reconcileMock: vi.fn(),
  }),
);

vi.mock("./platformResultService.js", () => ({
  claimPlatformResult: claimMock,
  initializePlatformResults: initializeMock,
  updatePlatformResult: updateMock,
}));

vi.mock("./postStatusReconciliationService.js", () => ({
  reconcilePostStatus: reconcileMock,
}));

import { PublishingOrchestrator } from "./publishingOrchestrator.js";
import type { PublishingAdapter } from "./publishingAdapter.js";

describe("PublishingOrchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    claimMock.mockImplementation(async (_postId: string, platform: string) => ({
      post: {
        platformResults: [
          {
            platform,
            status: "publishing",
            attemptCount: 1,
          },
        ],
      },
      attemptCount: 1,
    }));
    initializeMock.mockImplementation(
      async (_postId: string, platforms: string[]) => ({
        platformResults: platforms.map((platform: string) => ({
          platform,
          status: "pending",
          attemptCount: 0,
        })),
      }),
    );

    updateMock.mockResolvedValue({});
    reconcileMock.mockResolvedValue({});
  });

  it("persists publishing before invoking the adapter and records simulation", async () => {
    const events: string[] = [];

    initializeMock.mockImplementation(async (_postId, platforms) => {
      events.push("initialize");

      return {
        platformResults: platforms.map((platform: string) => ({
          platform,
          status: "pending",
          attemptCount: 0,
        })),
      };
    });

    claimMock.mockImplementation(async (_postId, platform) => {
      events.push("persist:publishing");

      return {
        post: {
          platformResults: [
            {
              platform,
              status: "publishing",
              attemptCount: 1,
            },
          ],
        },
        attemptCount: 1,
      };
    });

    updateMock.mockImplementation(async (_postId, update) => {
      events.push(`persist:${update.status}`);
      return {};
    });

    const adapter: PublishingAdapter = {
      publish: vi.fn(async (input) => {
        events.push("adapter");
        return {
          outcome: "simulated" as const,
          postId: input.postId,
          platform: input.platform,
          simulatedAt: new Date("2026-10-19T00:00:00.000Z"),
          message: "Dry run completed.",
        };
      }),
    };

    const orchestrator = new PublishingOrchestrator(adapter);

    const result = await orchestrator.processPost({
      _id: "post-123",
      caption: "Test caption",
      mediaIds: [],
      platforms: ["facebook"],
    });

    expect(events).toEqual([
      "initialize",
      "persist:publishing",
      "adapter",
      "persist:simulated",
    ]);

    expect(result).toMatchObject({
      postId: "post-123",
      results: [{ outcome: "simulated", platform: "facebook" }],
    });

    expect(updateMock).toHaveBeenCalledOnce();

    expect(updateMock).toHaveBeenCalledWith(
      "post-123",
      expect.objectContaining({
        platform: "facebook",
        status: "simulated",
      }),
    );
  });

  it("persists publication details only after confirmed publication", async () => {
    const publishedAt = new Date("2026-10-19T01:00:00.000Z");

    const adapter: PublishingAdapter = {
      publish: vi.fn(async (input) => ({
        outcome: "published" as const,
        postId: input.postId,
        platform: input.platform,
        externalPostId: "external-123",
        publishedAt,
      })),
    };

    const orchestrator = new PublishingOrchestrator(adapter);

    const result = await orchestrator.processPost({
      _id: "post-published",
      caption: "Confirmed publication test",
      mediaIds: [],
      platforms: ["facebook"],
    });

    expect(updateMock).toHaveBeenCalledOnce();

    expect(updateMock).toHaveBeenCalledWith("post-published", {
      platform: "facebook",
      status: "published",
      externalPostId: "external-123",
      publishedAt,
      attemptCount: 1,
    });

    expect(result.results).toMatchObject([
      {
        outcome: "published",
        externalPostId: "external-123",
        publishedAt,
      },
    ]);
  });

  it("persists a definite adapter failure", async () => {
    const adapter: PublishingAdapter = {
      publish: vi.fn(async (input) => ({
        outcome: "failed" as const,
        postId: input.postId,
        platform: input.platform,
        message: "Platform rejected the request.",
      })),
    };

    const orchestrator = new PublishingOrchestrator(adapter);

    const result = await orchestrator.processPost({
      _id: "post-failed",
      caption: "Failure test",
      mediaIds: [],
      platforms: ["facebook"],
    });

    expect(updateMock).toHaveBeenCalledOnce();

    expect(updateMock).toHaveBeenCalledWith("post-failed", {
      platform: "facebook",
      status: "failed",
      lastError: "Platform rejected the request.",
      attemptCount: 1,
    });

    expect(result.results).toMatchObject([
      {
        outcome: "failed",
        message: "Platform rejected the request.",
      },
    ]);
  });

  it("persists an unexpected adapter exception as unknown", async () => {
    const adapter: PublishingAdapter = {
      publish: vi.fn(async () => {
        throw new Error("Connection interrupted.");
      }),
    };

    const orchestrator = new PublishingOrchestrator(adapter);

    const result = await orchestrator.processPost({
      _id: "post-unknown",
      caption: "Uncertain outcome test",
      mediaIds: [],
      platforms: ["facebook"],
    });

    expect(updateMock).toHaveBeenCalledOnce();

    expect(updateMock).toHaveBeenCalledWith("post-unknown", {
      platform: "facebook",
      status: "unknown",
      lastError: "Publishing outcome is unknown after an unexpected error.",
      attemptCount: 1,
    });

    expect(result.results).toMatchObject([
      {
        outcome: "unknown",
        message: "Publishing outcome is unknown after an unexpected error.",
      },
    ]);
  });

  it("continues to the next platform after an adapter exception", async () => {
    const adapter: PublishingAdapter = {
      publish: vi.fn(async (input) => {
        if (input.platform === "facebook") {
          throw new Error("Connection interrupted.");
        }

        return {
          outcome: "simulated" as const,
          postId: input.postId,
          platform: input.platform,
          simulatedAt: new Date("2026-10-19T00:00:00.000Z"),
          message: "Dry run completed.",
        };
      }),
    };

    const orchestrator = new PublishingOrchestrator(adapter);

    const result = await orchestrator.processPost({
      _id: "post-multiple",
      caption: "Multiple platform test",
      mediaIds: [],
      platforms: ["facebook", "linkedin"],
    });

    expect(adapter.publish).toHaveBeenCalledTimes(2);

    expect(
      result.results.map((item) => ({
        platform: item.platform,
        outcome: item.outcome,
      })),
    ).toEqual([
      { platform: "facebook", outcome: "unknown" },
      { platform: "linkedin", outcome: "simulated" },
    ]);

    expect(updateMock).toHaveBeenNthCalledWith(
      1,
      "post-multiple",
      expect.objectContaining({
        platform: "facebook",
        status: "unknown",
      }),
    );

    expect(updateMock).toHaveBeenNthCalledWith(
      2,
      "post-multiple",
      expect.objectContaining({
        platform: "linkedin",
        status: "simulated",
      }),
    );
  });

  it.each(["published", "unknown", "simulated", "publishing", "failed"])(
    "skips a platform already in %s status",
    async (status) => {
      claimMock.mockResolvedValue(null);

      const adapter: PublishingAdapter = {
        publish: vi.fn(),
      };

      const orchestrator = new PublishingOrchestrator(adapter);

      const result = await orchestrator.processPost({
        _id: "post-already-processed",
        caption: "Do not republish",
        mediaIds: [],
        platforms: ["facebook"],
      });

      expect(adapter.publish).not.toHaveBeenCalled();
      expect(updateMock).not.toHaveBeenCalled();
      expect(result).toEqual({
        postId: "post-already-processed",
        results: [],
      });
    },
  );

  it("does not retry publishing when saving a confirmed result fails", async () => {
    const publishedAt = new Date("2026-10-19T01:00:00.000Z");

    const adapter: PublishingAdapter = {
      publish: vi.fn(async (input) => ({
        outcome: "published" as const,
        postId: input.postId,
        platform: input.platform,
        externalPostId: "external-write-failure-123",
        publishedAt,
      })),
    };

    updateMock.mockRejectedValueOnce(new Error("Database write failed."));

    const orchestrator = new PublishingOrchestrator(adapter);

    await expect(
      orchestrator.processPost({
        _id: "post-write-failure",
        caption: "Do not duplicate this post",
        mediaIds: [],
        platforms: ["facebook"],
      }),
    ).rejects.toThrow("Database write failed.");

    expect(adapter.publish).toHaveBeenCalledOnce();

    expect(updateMock).toHaveBeenCalledOnce();
    expect(updateMock).toHaveBeenCalledWith(
      "post-write-failure",
      expect.objectContaining({
        platform: "facebook",
        status: "published",
        externalPostId: "external-write-failure-123",
        publishedAt,
        attemptCount: 1,
      }),
    );
  });

  it("stops processing when saving a platform result fails", async () => {
    const adapter: PublishingAdapter = {
      publish: vi.fn(async (input) => ({
        outcome: "published" as const,
        postId: input.postId,
        platform: input.platform,
        externalPostId: `${input.platform}-external-123`,
        publishedAt: new Date("2026-10-19T01:00:00.000Z"),
      })),
    };

    updateMock
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("Instagram result save failed."));

    const orchestrator = new PublishingOrchestrator(adapter);

    await expect(
      orchestrator.processPost({
        _id: "post-partial-persistence",
        caption: "Test multi-platform publishing",
        mediaIds: [],
        platforms: ["facebook", "instagram", "linkedin"],
      }),
    ).rejects.toThrow("Instagram result save failed.");

    // Facebook and Instagram were attempted, but LinkedIn must not be.
    expect(adapter.publish).toHaveBeenCalledTimes(2);

    expect(adapter.publish).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ platform: "facebook" }),
    );

    expect(adapter.publish).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ platform: "instagram" }),
    );

    expect(updateMock).toHaveBeenCalledTimes(2);
  });

  it("records an invalid publication confirmation as unknown", async () => {
    const adapter: PublishingAdapter = {
      publish: vi.fn(async (input) => ({
        outcome: "published" as const,
        postId: input.postId,
        platform: input.platform,
        externalPostId: "   ",
        publishedAt: new Date("invalid"),
      })),
    };

    const orchestrator = new PublishingOrchestrator(adapter);

    const result = await orchestrator.processPost({
      _id: "post-invalid-confirmation",
      caption: "Validate publication confirmation",
      mediaIds: [],
      platforms: ["facebook"],
    });

    expect(adapter.publish).toHaveBeenCalledOnce();

    expect(updateMock).toHaveBeenCalledWith(
      "post-invalid-confirmation",
      expect.objectContaining({
        platform: "facebook",
        status: "unknown",
        lastError:
          "Publishing adapter returned an invalid publication confirmation; external outcome is unknown.",
        attemptCount: 1,
      }),
    );

    expect(result.results).toMatchObject([
      {
        outcome: "unknown",
        postId: "post-invalid-confirmation",
        platform: "facebook",
      },
    ]);
  });

  it("reconciles the overall post status after processing platforms", async () => {
    const adapter: PublishingAdapter = {
      publish: vi.fn(async (input) => ({
        outcome: "simulated" as const,
        postId: input.postId,
        platform: input.platform,
        simulatedAt: new Date("2026-10-19T00:00:00.000Z"),
        message: "Dry run completed.",
      })),
    };

    const orchestrator = new PublishingOrchestrator(adapter);

    await orchestrator.processPost({
      _id: "post-reconcile",
      caption: "Reconciliation test",
      mediaIds: [],
      platforms: ["facebook"],
    });

    expect(reconcileMock).toHaveBeenCalledOnce();
    expect(reconcileMock).toHaveBeenCalledWith("post-reconcile");
  });
});
