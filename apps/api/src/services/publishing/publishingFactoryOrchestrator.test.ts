import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PublishingInput } from "./publishingAdapter.js";
import type { OrchestratorPost } from "./publishingOrchestrator.js";

const mocks = vi.hoisted(() => ({
  linkedinConstructor: vi.fn(),
  linkedinPublish: vi.fn(),

  initialize: vi.fn(),
  claim: vi.fn(),
  update: vi.fn(),
  reconcile: vi.fn(),
}));

// Never instantiate the real LinkedIn adapter in these tests.
vi.mock("./linkedinPublishingAdapter.js", () => ({
  LinkedInPublishingAdapter: class {
    constructor(authUser: unknown) {
      mocks.linkedinConstructor(authUser);
    }

    publish(input: PublishingInput) {
      return mocks.linkedinPublish(input);
    }
  },
}));

// Mock persistence so tests do not change real post statuses.
vi.mock("./platformResultService.js", () => ({
  initializePlatformResults: mocks.initialize,
  claimPlatformResult: mocks.claim,
  updatePlatformResult: mocks.update,
}));

vi.mock("./postStatusReconciliationService.js", () => ({
  reconcilePostStatus: mocks.reconcile,
}));

import { createPublishingAdapter } from "./publishingAdapterFactory.js";
import { PublishingOrchestrator } from "./publishingOrchestrator.js";

const authUser = {
  id: "supabase-user-123",
  email: "test@example.com",
};

const workspaceId = "507f1f77bcf86cd799439011";
const postId = "507f1f77bcf86cd799439012";

const facebookConnectionId = "507f1f77bcf86cd799439013";

const linkedinConnectionId = "507f1f77bcf86cd799439014";

function createPost(
  platform: "facebook" | "linkedin" | "instagram",
): OrchestratorPost {
  return {
    _id: postId,
    workspaceId,
    caption: "Storm integration test",
    mediaIds: [],
    platforms: [platform],
    platformConnections: {
      facebook: facebookConnectionId,
      linkedin: linkedinConnectionId,
    },
  };
}

function createOrchestrator() {
  return new PublishingOrchestrator(createPublishingAdapter(authUser));
}

describe("Publishing factory and orchestrator integration", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.initialize.mockImplementation(
      async (_id: string, platforms: string[]) => ({
        platformResults: platforms.map((platform) => ({
          platform,
          status: "pending",
          attemptCount: 0,
        })),
      }),
    );

    mocks.claim.mockImplementation(async (_id: string, platform: string) => ({
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

    mocks.update.mockResolvedValue({});
    mocks.reconcile.mockResolvedValue(undefined);

    mocks.linkedinPublish.mockImplementation(
      async (input: PublishingInput) => ({
        outcome: "simulated" as const,
        postId: input.postId,
        platform: input.platform,
        simulatedAt: new Date("2026-10-30T00:00:00.000Z"),
        message: "LinkedIn dry run completed.",
      }),
    );
  });

  it("routes LinkedIn through the factory and orchestrator", async () => {
    const orchestrator = createOrchestrator();

    const result = await orchestrator.processPost(createPost("linkedin"));

    expect(mocks.linkedinConstructor).toHaveBeenCalledWith(authUser);

    expect(mocks.linkedinPublish).toHaveBeenCalledOnce();

    expect(mocks.linkedinPublish).toHaveBeenCalledWith({
      postId,
      workspaceId,
      platform: "linkedin",
      connectionId: linkedinConnectionId,
      caption: "Storm integration test",
      mediaIds: [],
    });

    expect(result.results).toMatchObject([
      {
        platform: "linkedin",
        outcome: "simulated",
      },
    ]);

    expect(mocks.update).toHaveBeenCalledWith(
      postId,
      expect.objectContaining({
        platform: "linkedin",
        status: "simulated",
        attemptCount: 1,
      }),
    );

    expect(mocks.reconcile).toHaveBeenCalledWith(postId);
  });

  it("keeps Facebook publishing disabled", async () => {
    const orchestrator = createOrchestrator();

    const result = await orchestrator.processPost(createPost("facebook"));

    expect(result.results).toEqual([
      {
        outcome: "failed",
        postId,
        platform: "facebook",
        message: "Publishing is not configured for facebook.",
      },
    ]);

    expect(mocks.linkedinPublish).not.toHaveBeenCalled();

    expect(mocks.update).toHaveBeenCalledWith(
      postId,
      expect.objectContaining({
        platform: "facebook",
        status: "failed",
        attemptCount: 1,
      }),
    );
  });

  it("keeps Instagram publishing disabled", async () => {
    const orchestrator = createOrchestrator();

    const result = await orchestrator.processPost(createPost("instagram"));

    expect(result.results).toEqual([
      {
        outcome: "failed",
        postId,
        platform: "instagram",
        message: "Publishing is not configured for instagram.",
      },
    ]);

    expect(mocks.linkedinPublish).not.toHaveBeenCalled();

    expect(mocks.update).toHaveBeenCalledWith(
      postId,
      expect.objectContaining({
        platform: "instagram",
        status: "failed",
      }),
    );
  });

  it("rejects LinkedIn without a selected account", async () => {
    const orchestrator = createOrchestrator();

    const post = createPost("linkedin");

    post.platformConnections = {
      facebook: facebookConnectionId,
    };

    const result = await orchestrator.processPost(post);

    expect(result.results).toEqual([
      {
        outcome: "failed",
        postId,
        platform: "linkedin",
        message: "No LinkedIn account was selected for this post.",
      },
    ]);

    expect(mocks.linkedinPublish).not.toHaveBeenCalled();

    expect(mocks.update).toHaveBeenCalledWith(
      postId,
      expect.objectContaining({
        platform: "linkedin",
        status: "failed",
      }),
    );
  });

  it("preserves unknown outcomes after an adapter exception", async () => {
    mocks.linkedinPublish.mockRejectedValue(
      new Error("External request outcome uncertain."),
    );

    const orchestrator = createOrchestrator();

    const result = await orchestrator.processPost(createPost("linkedin"));

    expect(result.results).toEqual([
      {
        outcome: "unknown",
        postId,
        platform: "linkedin",
        message: "Publishing outcome is unknown after an unexpected error.",
      },
    ]);

    expect(mocks.linkedinPublish).toHaveBeenCalledOnce();

    expect(mocks.update).toHaveBeenCalledWith(
      postId,
      expect.objectContaining({
        platform: "linkedin",
        status: "unknown",
      }),
    );
  });

  it("does not invoke the adapter when a platform claim fails", async () => {
    mocks.claim.mockResolvedValue(null);

    const orchestrator = createOrchestrator();

    const result = await orchestrator.processPost(createPost("linkedin"));

    expect(result).toEqual({
      postId,
      results: [],
    });

    expect(mocks.linkedinPublish).not.toHaveBeenCalled();

    expect(mocks.update).not.toHaveBeenCalled();

    expect(mocks.reconcile).toHaveBeenCalledWith(postId);
  });
});
