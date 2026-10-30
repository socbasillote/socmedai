import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "../userProfileService.js";

const mocks = vi.hoisted(() => ({
  initializePlatformResults: vi.fn(),
  claimPlatformResult: vi.fn(),
  updatePlatformResult: vi.fn(),
  reconcilePostStatus: vi.fn(),

  authorizeFacebookPublishing: vi.fn(),

  isValidWorkspaceId: vi.fn(),
  getUserWorkspaceById: vi.fn(),

  postFindOne: vi.fn(),
  postSelect: vi.fn(),
  postLean: vi.fn(),

  getFacebookPublishingCredentials: vi.fn(),
  publishFacebookTextPost: vi.fn(),
}));

vi.mock("./platformResultService.js", () => ({
  initializePlatformResults: mocks.initializePlatformResults,
  claimPlatformResult: mocks.claimPlatformResult,
  updatePlatformResult: mocks.updatePlatformResult,
}));

vi.mock("./postStatusReconciliationService.js", () => ({
  reconcilePostStatus: mocks.reconcilePostStatus,
}));

vi.mock("./facebookPublishingAuthorizationService.js", () => ({
  authorizeFacebookPublishing: mocks.authorizeFacebookPublishing,
}));

vi.mock("../workspaceService.js", () => ({
  isValidWorkspaceId: mocks.isValidWorkspaceId,
  getUserWorkspaceById: mocks.getUserWorkspaceById,
}));

vi.mock("../../models/Post.js", () => ({
  default: {
    findOne: mocks.postFindOne,
  },
}));

vi.mock("../facebook/facebookPublishingTokenService.js", () => ({
  getFacebookPublishingCredentials: mocks.getFacebookPublishingCredentials,
}));

vi.mock("../facebook/facebookPostService.js", () => ({
  publishFacebookTextPost: mocks.publishFacebookTextPost,
}));

import { PublishingOrchestrator } from "./publishingOrchestrator.js";

import { FacebookPublishingAdapter } from "./facebookPublishingAdapter.js";

const WORKSPACE_ID = "507f1f77bcf86cd799439011";

const POST_ID = "507f1f77bcf86cd799439012";

const CONNECTION_ID = "507f1f77bcf86cd799439013";

const FACEBOOK_PAGE_ID = "123456789";

const authUser = {
  id: "storm-facebook-orchestrator-test",
  email: "test@example.com",
} as AuthenticatedUser;

// This represents a post already atomically claimed
// by the Facebook immediate publishing claim service.
const claimedPost = {
  _id: POST_ID,
  workspaceId: WORKSPACE_ID,
  caption: "Untrusted orchestration snapshot",
  mediaIds: [],
  platforms: ["facebook" as const],
};

// The adapter must load the persisted post rather
// than trusting the orchestration snapshot.
const persistedPost = {
  caption: "Persisted Facebook Page announcement",
  mediaIds: [],
  platforms: ["facebook"],
  platformConnections: {
    facebook: CONNECTION_ID,
  },
};

describe("Facebook adapter and orchestrator integration", () => {
  const events: string[] = [];

  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
    events.length = 0;

    // Never allow a real HTTP request.
    fetchMock = vi.fn(async () => {
      throw new Error("Unexpected external HTTP request.");
    });

    mocks.initializePlatformResults.mockImplementation(async () => {
      events.push("initialize");

      return {
        platformResults: [
          {
            platform: "facebook",
            status: "pending",
            attemptCount: 0,
          },
        ],
      };
    });

    mocks.claimPlatformResult.mockImplementation(async () => {
      events.push("claim");

      return {
        post: {
          platformResults: [
            {
              platform: "facebook",
              status: "publishing",
              attemptCount: 1,
            },
          ],
        },
        attemptCount: 1,
      };
    });

    mocks.authorizeFacebookPublishing.mockImplementation(async () => {
      events.push("authorize");
    });

    mocks.isValidWorkspaceId.mockReturnValue(true);

    mocks.getUserWorkspaceById.mockImplementation(async () => {
      events.push("workspace");

      return {
        _id: WORKSPACE_ID,
      };
    });

    mocks.postFindOne.mockImplementation(() => {
      events.push("load-post");

      return {
        select: mocks.postSelect,
      };
    });

    mocks.postSelect.mockReturnValue({
      lean: mocks.postLean,
    });

    mocks.postLean.mockResolvedValue(persistedPost);

    mocks.getFacebookPublishingCredentials.mockImplementation(async () => {
      events.push("credentials");

      return {
        connectionId: CONNECTION_ID,
        facebookPageId: FACEBOOK_PAGE_ID,
        pageAccessToken: "mocked-page-access-token",
      };
    });

    mocks.publishFacebookTextPost.mockImplementation(async () => {
      events.push("publish");

      return {
        outcome: "published",
        externalPostId: "123456789_987654321",
      };
    });

    mocks.updatePlatformResult.mockImplementation(
      async (_postId: string, update: { status: string }) => {
        events.push(`persist:${update.status}`);

        return {};
      },
    );

    mocks.reconcilePostStatus.mockImplementation(async () => {
      events.push("reconcile");

      return {};
    });
  });

  function createOrchestrator() {
    const adapter = new FacebookPublishingAdapter(
      authUser,
      fetchMock as unknown as typeof fetch,
    );

    return new PublishingOrchestrator(adapter);
  }

  it("executes the complete authorized Facebook workflow in order", async () => {
    const orchestrator = createOrchestrator();

    const result = await orchestrator.processPost(claimedPost);

    expect(events).toEqual([
      "initialize",
      "claim",
      "authorize",
      "workspace",
      "load-post",
      "credentials",
      "publish",
      "persist:published",
      "reconcile",
    ]);

    expect(mocks.authorizeFacebookPublishing).toHaveBeenCalledWith({
      authUser,
      workspaceId: WORKSPACE_ID,
      postId: POST_ID,
    });

    expect(mocks.getFacebookPublishingCredentials).toHaveBeenCalledWith({
      authUser,
      workspaceId: WORKSPACE_ID,
      connectionId: CONNECTION_ID,
    });

    // The saved caption and selected Page
    // are the trusted publishing source.
    expect(mocks.publishFacebookTextPost).toHaveBeenCalledWith(
      {
        pageId: FACEBOOK_PAGE_ID,
        pageAccessToken: "mocked-page-access-token",
        message: "Persisted Facebook Page announcement",
      },
      fetchMock,
    );

    expect(mocks.updatePlatformResult).toHaveBeenCalledWith(
      POST_ID,
      expect.objectContaining({
        platform: "facebook",
        status: "published",
        externalPostId: "123456789_987654321",
        attemptCount: 1,
        publishedAt: expect.any(Date),
      }),
    );

    expect(result.results).toHaveLength(1);

    expect(result.results[0]?.outcome).toBe("published");

    // The lower-level publishing service
    // is mocked, so no HTTP request occurs.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops before credentials when authorization fails", async () => {
    mocks.authorizeFacebookPublishing.mockImplementation(async () => {
      events.push("authorize");

      throw new Error("Workspace access denied.");
    });

    const orchestrator = createOrchestrator();

    const result = await orchestrator.processPost(claimedPost);

    expect(events).toEqual([
      "initialize",
      "claim",
      "authorize",
      "persist:failed",
      "reconcile",
    ]);

    expect(result.results).toMatchObject([
      {
        outcome: "failed",
        postId: POST_ID,
        platform: "facebook",
        message: "Facebook publishing authorization failed.",
      },
    ]);

    expect(mocks.getUserWorkspaceById).not.toHaveBeenCalled();

    expect(mocks.getFacebookPublishingCredentials).not.toHaveBeenCalled();

    expect(mocks.publishFacebookTextPost).not.toHaveBeenCalled();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never reaches authorization if the platform claim fails", async () => {
    mocks.claimPlatformResult.mockImplementation(async () => {
      events.push("claim");

      return null;
    });

    const orchestrator = createOrchestrator();

    const result = await orchestrator.processPost(claimedPost);

    expect(events).toEqual(["initialize", "claim", "reconcile"]);

    expect(result.results).toEqual([]);

    expect(mocks.authorizeFacebookPublishing).not.toHaveBeenCalled();

    expect(mocks.getFacebookPublishingCredentials).not.toHaveBeenCalled();

    expect(mocks.publishFacebookTextPost).not.toHaveBeenCalled();

    expect(mocks.updatePlatformResult).not.toHaveBeenCalled();
  });

  it("preserves an unknown result without retrying a failed external execution", async () => {
    mocks.publishFacebookTextPost.mockImplementation(async () => {
      events.push("publish");

      throw new Error("External outcome could not be confirmed.");
    });

    const orchestrator = createOrchestrator();

    const result = await orchestrator.processPost(claimedPost);

    expect(events).toEqual([
      "initialize",
      "claim",
      "authorize",
      "workspace",
      "load-post",
      "credentials",
      "publish",
      "persist:unknown",
      "reconcile",
    ]);

    expect(result.results).toMatchObject([
      {
        outcome: "unknown",
        postId: POST_ID,
        platform: "facebook",
      },
    ]);

    expect(mocks.publishFacebookTextPost).toHaveBeenCalledOnce();

    expect(mocks.updatePlatformResult).toHaveBeenCalledWith(
      POST_ID,
      expect.objectContaining({
        platform: "facebook",
        status: "unknown",
        attemptCount: 1,
      }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not publish when Facebook credentials are unavailable", async () => {
    mocks.getFacebookPublishingCredentials.mockImplementation(async () => {
      events.push("credentials");

      throw new Error("Facebook Page connection revoked.");
    });

    const orchestrator = createOrchestrator();

    const result = await orchestrator.processPost(claimedPost);

    expect(events).toEqual([
      "initialize",
      "claim",
      "authorize",
      "workspace",
      "load-post",
      "credentials",
      "persist:failed",
      "reconcile",
    ]);

    expect(result.results).toMatchObject([
      {
        outcome: "failed",
        postId: POST_ID,
        platform: "facebook",
        message:
          "Facebook Page publishing credentials are unavailable or unauthorized.",
      },
    ]);

    expect(mocks.publishFacebookTextPost).not.toHaveBeenCalled();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
