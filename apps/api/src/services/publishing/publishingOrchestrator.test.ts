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
      workspaceId: "workspace-123",
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
      workspaceId: "workspace-123",
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
      workspaceId: "workspace-123",
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
      workspaceId: "workspace-123",
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
      workspaceId: "workspace-123",
      caption: "Multiple platform test",
      mediaIds: [],
      platforms: ["facebook", "linkedin"],
      platformConnections: {
        linkedin: "507f1f77bcf86cd799439011",
      },
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
        workspaceId: "workspace-123",
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
        workspaceId: "workspace-123",
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
        workspaceId: "workspace-123",
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
      workspaceId: "workspace-123",
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
      workspaceId: "workspace-123",
      caption: "Reconciliation test",
      mediaIds: [],
      platforms: ["facebook"],
    });

    expect(reconcileMock).toHaveBeenCalledOnce();
    expect(reconcileMock).toHaveBeenCalledWith("post-reconcile");
  });

  it("passes the selected LinkedIn connection to the adapter", async () => {
    const connectionId = "507f1f77bcf86cd799439011";

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

    const result = await orchestrator.processPost({
      _id: "post-123",
      workspaceId: "workspace-123",
      caption: "LinkedIn publishing test",
      mediaIds: [],
      platforms: ["linkedin"],
      platformConnections: {
        linkedin: connectionId,
      },
    });

    expect(adapter.publish).toHaveBeenCalledOnce();

    expect(adapter.publish).toHaveBeenCalledWith({
      postId: "post-123",
      workspaceId: "workspace-123",
      platform: "linkedin",
      connectionId,
      caption: "LinkedIn publishing test",
      mediaIds: [],
    });

    expect(claimMock).toHaveBeenCalledWith("post-123", "linkedin");

    expect(updateMock).toHaveBeenCalledWith(
      "post-123",
      expect.objectContaining({
        platform: "linkedin",
        status: "simulated",
      }),
    );

    expect(reconcileMock).toHaveBeenCalledWith("post-123");

    expect(result.postId).toBe("post-123");
  });

  it("does not call the adapter when no LinkedIn account is selected", async () => {
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
      _id: "post-123",
      workspaceId: "workspace-123",
      caption: "LinkedIn publishing test",
      mediaIds: [],
      platforms: ["linkedin"],
    });

    // The platform attempt is claimed before the missing-account check.
    expect(claimMock).toHaveBeenCalledWith("post-123", "linkedin");

    // Publishing must stop before reaching the adapter.
    expect(adapter.publish).not.toHaveBeenCalled();

    // The failure must be persisted.
    expect(updateMock).toHaveBeenCalledWith(
      "post-123",
      expect.objectContaining({
        platform: "linkedin",
        status: "failed",
        lastError: "No LinkedIn account was selected for this post.",
      }),
    );

    // The overall post status must be reconciled.
    expect(reconcileMock).toHaveBeenCalledWith("post-123");
  });
});

describe("platform-specific connection routing", () => {
  const workspaceId = "507f1f77bcf86cd799439011";
  const facebookConnectionId = "507f1f77bcf86cd799439013";
  const linkedinConnectionId = "507f1f77bcf86cd799439014";

  function createRecordingAdapter() {
    const publish = vi.fn<PublishingAdapter["publish"]>(async (input) => ({
      outcome: "simulated",
      postId: input.postId,
      platform: input.platform,
      simulatedAt: new Date("2026-10-30T00:00:00.000Z"),
      message: "Dry run completed.",
    }));

    return {
      publish,
    } satisfies PublishingAdapter;
  }

  it("passes the selected Facebook Page connection to Facebook", async () => {
    const adapter = createRecordingAdapter();
    const orchestrator = new PublishingOrchestrator(adapter);

    const result = await orchestrator.processPost({
      _id: "post-facebook-routing",
      workspaceId,
      caption: "Facebook announcement",
      mediaIds: [],
      platforms: ["facebook"],
      platformConnections: {
        facebook: facebookConnectionId,
      },
    });

    expect(adapter.publish).toHaveBeenCalledOnce();

    expect(adapter.publish).toHaveBeenCalledWith({
      postId: "post-facebook-routing",
      workspaceId,
      platform: "facebook",
      connectionId: facebookConnectionId,
      caption: "Facebook announcement",
      mediaIds: [],
    });

    expect(result.results).toMatchObject([
      {
        platform: "facebook",
        outcome: "simulated",
      },
    ]);
  });

  it("passes the selected LinkedIn account connection to LinkedIn", async () => {
    const adapter = createRecordingAdapter();
    const orchestrator = new PublishingOrchestrator(adapter);

    await orchestrator.processPost({
      _id: "post-linkedin-routing",
      workspaceId,
      caption: "LinkedIn announcement",
      mediaIds: [],
      platforms: ["linkedin"],
      platformConnections: {
        linkedin: linkedinConnectionId,
      },
    });

    expect(adapter.publish).toHaveBeenCalledOnce();

    expect(adapter.publish).toHaveBeenCalledWith({
      postId: "post-linkedin-routing",
      workspaceId,
      platform: "linkedin",
      connectionId: linkedinConnectionId,
      caption: "LinkedIn announcement",
      mediaIds: [],
    });
  });

  it("isolates connection IDs across Facebook, LinkedIn, and Instagram", async () => {
    const adapter = createRecordingAdapter();
    const orchestrator = new PublishingOrchestrator(adapter);

    const result = await orchestrator.processPost({
      _id: "post-multiple-platforms",
      workspaceId,
      caption: "Multi-platform announcement",
      mediaIds: [],
      platforms: ["facebook", "linkedin", "instagram"],
      platformConnections: {
        facebook: facebookConnectionId,
        linkedin: linkedinConnectionId,
      },
    });

    expect(adapter.publish).toHaveBeenCalledTimes(3);

    const calls = adapter.publish.mock.calls.map(([input]) => input);

    expect(calls).toEqual([
      {
        postId: "post-multiple-platforms",
        workspaceId,
        platform: "facebook",
        connectionId: facebookConnectionId,
        caption: "Multi-platform announcement",
        mediaIds: [],
      },
      {
        postId: "post-multiple-platforms",
        workspaceId,
        platform: "linkedin",
        connectionId: linkedinConnectionId,
        caption: "Multi-platform announcement",
        mediaIds: [],
      },
      {
        postId: "post-multiple-platforms",
        workspaceId,
        platform: "instagram",
        caption: "Multi-platform announcement",
        mediaIds: [],
      },
    ]);

    expect(
      result.results.map((item) => ({
        platform: item.platform,
        outcome: item.outcome,
      })),
    ).toEqual([
      { platform: "facebook", outcome: "simulated" },
      { platform: "linkedin", outcome: "simulated" },
      { platform: "instagram", outcome: "simulated" },
    ]);
  });

  it("preserves Facebook dry-run behavior without a connection ID", async () => {
    const adapter = createRecordingAdapter();
    const orchestrator = new PublishingOrchestrator(adapter);

    const result = await orchestrator.processPost({
      _id: "post-facebook-dry-run",
      workspaceId,
      caption: "Facebook dry-run test",
      mediaIds: [],
      platforms: ["facebook"],
    });

    expect(adapter.publish).toHaveBeenCalledWith({
      postId: "post-facebook-dry-run",
      workspaceId,
      platform: "facebook",
      caption: "Facebook dry-run test",
      mediaIds: [],
    });

    expect(result.results).toMatchObject([
      {
        platform: "facebook",
        outcome: "simulated",
      },
    ]);
  });

  it("rejects LinkedIn publishing without a selected account", async () => {
    const adapter = createRecordingAdapter();
    const orchestrator = new PublishingOrchestrator(adapter);

    const result = await orchestrator.processPost({
      _id: "post-linkedin-no-account",
      workspaceId,
      caption: "LinkedIn missing account",
      mediaIds: [],
      platforms: ["linkedin"],
      platformConnections: {
        facebook: facebookConnectionId,
      },
    });

    expect(adapter.publish).not.toHaveBeenCalled();

    expect(result.results).toEqual([
      {
        outcome: "failed",
        postId: "post-linkedin-no-account",
        platform: "linkedin",
        message: "No LinkedIn account was selected for this post.",
      },
    ]);

    expect(updateMock).toHaveBeenCalledWith(
      "post-linkedin-no-account",
      expect.objectContaining({
        platform: "linkedin",
        status: "failed",
        lastError: "No LinkedIn account was selected for this post.",
      }),
    );
  });
});
