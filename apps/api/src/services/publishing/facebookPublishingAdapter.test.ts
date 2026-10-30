import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "../userProfileService.js";

import type { PublishingInput } from "./publishingAdapter.js";

import { FacebookPublishingAdapter } from "./facebookPublishingAdapter.js";

const mocks = vi.hoisted(() => ({
  isValidWorkspaceId: vi.fn(),
  getUserWorkspaceById: vi.fn(),

  postFindOne: vi.fn(),
  postSelect: vi.fn(),
  postLean: vi.fn(),

  getFacebookPublishingCredentials: vi.fn(),
  publishFacebookTextPost: vi.fn(),

  authorizeFacebookPublishing: vi.fn(),
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

vi.mock("./facebookPublishingAuthorizationService.js", () => ({
  authorizeFacebookPublishing: mocks.authorizeFacebookPublishing,
}));

const WORKSPACE_ID = "507f1f77bcf86cd799439011";

const POST_ID = "507f1f77bcf86cd799439012";

const CONNECTION_ID = "507f1f77bcf86cd799439013";

const FACEBOOK_PAGE_ID = "123456789";

const AUTH_USER = {
  id: "storm-test-user",
} as AuthenticatedUser;

const VALID_INPUT: PublishingInput = {
  postId: POST_ID,
  workspaceId: WORKSPACE_ID,
  platform: "facebook",
  caption: "Untrusted request caption",
  mediaIds: [],
};

function postFixture(overrides: Record<string, unknown> = {}) {
  return {
    caption: "Persisted Storm Facebook post",
    mediaIds: [],
    platforms: ["facebook"],
    platformConnections: {
      facebook: CONNECTION_ID,
    },
    ...overrides,
  };
}

/**
 * The adapter requires an HTTP transport.
 *
 * This function is deliberately mocked so
 * tests cannot contact Facebook.
 */
function createFetchMock() {
  return vi.fn(
    async (..._args: Parameters<typeof fetch>): Promise<Response> => {
      return new Response(null, {
        status: 204,
      });
    },
  );
}

describe("FacebookPublishingAdapter", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.isValidWorkspaceId.mockReturnValue(true);

    mocks.getUserWorkspaceById.mockResolvedValue({
      _id: WORKSPACE_ID,
      name: "Storm Workspace",
    });

    mocks.postFindOne.mockReturnValue({
      select: mocks.postSelect,
    });

    mocks.postSelect.mockReturnValue({
      lean: mocks.postLean,
    });

    mocks.postLean.mockResolvedValue(postFixture());

    mocks.getFacebookPublishingCredentials.mockResolvedValue({
      connectionId: CONNECTION_ID,
      facebookPageId: FACEBOOK_PAGE_ID,
      pageAccessToken: "decrypted-test-token",
    });

    mocks.publishFacebookTextPost.mockResolvedValue({
      outcome: "published",
      externalPostId: "123456789_987654321",
    });

    mocks.authorizeFacebookPublishing.mockResolvedValue(undefined);
  });

  function createAdapter() {
    const fetchMock = createFetchMock();

    const adapter = new FacebookPublishingAdapter(
      AUTH_USER,
      fetchMock as unknown as typeof fetch,
    );

    return {
      adapter,
      fetchMock,
    };
  }

  it("rejects Facebook publishing when authorization fails", async () => {
    // Simulate a rejected Facebook-specific authorization.
    mocks.authorizeFacebookPublishing.mockRejectedValue(
      new Error("Workspace access denied."),
    );

    const { adapter, fetchMock } = createAdapter();

    const result = await adapter.publish(VALID_INPUT);

    // The adapter must return a safe failure.
    expect(result).toEqual({
      outcome: "failed",
      postId: POST_ID,
      platform: "facebook",
      message: "Facebook publishing authorization failed.",
    });

    // Verify Facebook-specific authorization was called.
    expect(mocks.authorizeFacebookPublishing).toHaveBeenCalledOnce();

    expect(mocks.authorizeFacebookPublishing).toHaveBeenCalledWith({
      authUser: AUTH_USER,
      workspaceId: WORKSPACE_ID,
      postId: POST_ID,
    });

    // Authorization failure must stop execution
    // before any additional workspace or post queries.
    expect(mocks.getUserWorkspaceById).not.toHaveBeenCalled();

    expect(mocks.postFindOne).not.toHaveBeenCalled();

    // No Facebook credentials may be retrieved.
    expect(mocks.getFacebookPublishingCredentials).not.toHaveBeenCalled();

    // No Facebook publishing request may be made.
    expect(mocks.publishFacebookTextPost).not.toHaveBeenCalled();

    // The injected HTTP transport must remain unused.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("publishes an authorized Facebook text post", async () => {
    const { adapter } = createAdapter();

    const result = await adapter.publish(VALID_INPUT);

    expect(result).toMatchObject({
      outcome: "published",
      postId: POST_ID,
      platform: "facebook",
      externalPostId: "123456789_987654321",
    });

    if (result.outcome !== "published") {
      throw new Error("Expected a confirmed publication.");
    }

    expect(result.publishedAt).toBeInstanceOf(Date);
  });

  it("rejects non-Facebook platforms", async () => {
    const { adapter } = createAdapter();

    const result = await adapter.publish({
      ...VALID_INPUT,
      platform: "instagram",
    });

    expect(result).toEqual({
      outcome: "failed",
      postId: POST_ID,
      platform: "instagram",
      message: "This adapter only supports Facebook publishing.",
    });

    expect(mocks.getUserWorkspaceById).not.toHaveBeenCalled();

    expect(mocks.publishFacebookTextPost).not.toHaveBeenCalled();
  });

  it("rejects media attachments before authorization", async () => {
    const { adapter } = createAdapter();

    const result = await adapter.publish({
      ...VALID_INPUT,
      mediaIds: ["507f1f77bcf86cd799439014"],
    });

    expect(result).toMatchObject({
      outcome: "failed",
      message: "Facebook media publishing is not supported yet.",
    });

    expect(mocks.postFindOne).not.toHaveBeenCalled();

    expect(mocks.publishFacebookTextPost).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated users", async () => {
    const fetchMock = createFetchMock();

    const adapter = new FacebookPublishingAdapter(
      { id: "" } as AuthenticatedUser,
      fetchMock as unknown as typeof fetch,
    );

    const result = await adapter.publish(VALID_INPUT);

    expect(result).toMatchObject({
      outcome: "failed",
      message: "Publishing authentication failed.",
    });

    expect(mocks.getUserWorkspaceById).not.toHaveBeenCalled();
  });

  it.each([
    ["workspaceId", "invalid-workspace"],
    ["postId", "invalid-post"],
  ] as const)("rejects an invalid %s", async (field, invalidValue) => {
    mocks.isValidWorkspaceId.mockImplementation(
      (value: string) => value !== invalidValue,
    );

    const { adapter } = createAdapter();

    const result = await adapter.publish({
      ...VALID_INPUT,
      [field]: invalidValue,
    });

    expect(result).toMatchObject({
      outcome: "failed",
      message: "A valid post and workspace are required.",
    });

    expect(mocks.postFindOne).not.toHaveBeenCalled();
  });

  it("rejects inaccessible workspaces", async () => {
    mocks.getUserWorkspaceById.mockResolvedValue(null);

    const { adapter } = createAdapter();

    const result = await adapter.publish(VALID_INPUT);

    expect(result).toMatchObject({
      outcome: "failed",
      message: "Publishing authorization failed.",
    });

    expect(mocks.postFindOne).not.toHaveBeenCalled();
  });

  it("handles workspace authorization errors safely", async () => {
    mocks.getUserWorkspaceById.mockRejectedValue(
      new Error("Internal authorization error"),
    );

    const { adapter } = createAdapter();

    const result = await adapter.publish(VALID_INPUT);

    expect(result).toMatchObject({
      outcome: "failed",
      message: "Publishing authorization failed.",
    });

    expect(mocks.postFindOne).not.toHaveBeenCalled();
  });

  it("loads the saved post from the authorized workspace", async () => {
    const { adapter } = createAdapter();

    await adapter.publish(VALID_INPUT);

    expect(mocks.getUserWorkspaceById).toHaveBeenCalledWith(
      AUTH_USER,
      WORKSPACE_ID,
    );

    expect(mocks.postFindOne).toHaveBeenCalledWith({
      _id: POST_ID,
      workspaceId: WORKSPACE_ID,
    });

    expect(mocks.postSelect).toHaveBeenCalledWith(
      "caption mediaIds platforms platformConnections",
    );
  });

  it("rejects missing posts", async () => {
    mocks.postLean.mockResolvedValue(null);

    const { adapter } = createAdapter();

    const result = await adapter.publish(VALID_INPUT);

    expect(result).toMatchObject({
      outcome: "failed",
      message: "Post not found in the authorized workspace.",
    });

    expect(mocks.getFacebookPublishingCredentials).not.toHaveBeenCalled();
  });

  it("handles post database errors safely", async () => {
    mocks.postLean.mockRejectedValue(new Error("MongoDB unavailable"));

    const { adapter } = createAdapter();

    const result = await adapter.publish(VALID_INPUT);

    expect(result).toMatchObject({
      outcome: "failed",
      message: "Unable to load the post for publishing.",
    });
  });

  it("rejects posts that do not target Facebook", async () => {
    mocks.postLean.mockResolvedValue(
      postFixture({
        platforms: ["linkedin"],
      }),
    );

    const { adapter } = createAdapter();

    const result = await adapter.publish(VALID_INPUT);

    expect(result).toMatchObject({
      outcome: "failed",
      message: "Post is not configured for Facebook.",
    });

    expect(mocks.publishFacebookTextPost).not.toHaveBeenCalled();
  });

  it("rejects posts without a selected Facebook Page", async () => {
    mocks.postLean.mockResolvedValue(
      postFixture({
        platformConnections: {},
      }),
    );

    const { adapter } = createAdapter();

    const result = await adapter.publish(VALID_INPUT);

    expect(result).toMatchObject({
      outcome: "failed",
      message: "No Facebook Page was selected for this post.",
    });

    expect(mocks.getFacebookPublishingCredentials).not.toHaveBeenCalled();
  });

  it("rejects media saved on the post", async () => {
    mocks.postLean.mockResolvedValue(
      postFixture({
        mediaIds: ["507f1f77bcf86cd799439014"],
      }),
    );

    const { adapter } = createAdapter();

    const result = await adapter.publish(VALID_INPUT);

    expect(result).toMatchObject({
      outcome: "failed",
      message: "Facebook media publishing is not supported yet.",
    });

    expect(mocks.publishFacebookTextPost).not.toHaveBeenCalled();
  });

  it("rejects empty persisted captions", async () => {
    mocks.postLean.mockResolvedValue(
      postFixture({
        caption: "   ",
      }),
    );

    const { adapter } = createAdapter();

    const result = await adapter.publish(VALID_INPUT);

    expect(result).toMatchObject({
      outcome: "failed",
      message: "A caption is required for Facebook publishing.",
    });

    expect(mocks.publishFacebookTextPost).not.toHaveBeenCalled();
  });

  it("uses the persisted caption rather than the caller caption", async () => {
    const { adapter, fetchMock } = createAdapter();

    await adapter.publish(VALID_INPUT);

    expect(mocks.publishFacebookTextPost).toHaveBeenCalledWith(
      {
        pageId: FACEBOOK_PAGE_ID,
        pageAccessToken: "decrypted-test-token",
        message: "Persisted Storm Facebook post",
      },
      fetchMock,
    );
  });

  it("retrieves credentials for the selected Facebook Page", async () => {
    const { adapter } = createAdapter();

    await adapter.publish(VALID_INPUT);

    expect(mocks.getFacebookPublishingCredentials).toHaveBeenCalledWith({
      authUser: AUTH_USER,
      workspaceId: WORKSPACE_ID,
      connectionId: CONNECTION_ID,
    });
  });

  it("rejects unavailable Facebook publishing credentials", async () => {
    mocks.getFacebookPublishingCredentials.mockRejectedValue(
      new Error("Facebook connection revoked"),
    );

    const { adapter } = createAdapter();

    const result = await adapter.publish(VALID_INPUT);

    expect(result).toMatchObject({
      outcome: "failed",
      message:
        "Facebook Page publishing credentials are unavailable or unauthorized.",
    });

    expect(mocks.publishFacebookTextPost).not.toHaveBeenCalled();
  });

  it.each([
    [
      "an empty Page access token",
      {
        connectionId: CONNECTION_ID,
        facebookPageId: FACEBOOK_PAGE_ID,
        pageAccessToken: "",
      },
    ],
    [
      "a whitespace-only Page access token",
      {
        connectionId: CONNECTION_ID,
        facebookPageId: FACEBOOK_PAGE_ID,
        pageAccessToken: "   ",
      },
    ],
    [
      "an empty Facebook Page ID",
      {
        connectionId: CONNECTION_ID,
        facebookPageId: "",
        pageAccessToken: "test-token",
      },
    ],
    [
      "a malformed Facebook Page ID",
      {
        connectionId: CONNECTION_ID,
        facebookPageId: "invalid-page-id",
        pageAccessToken: "test-token",
      },
    ],
  ])(
    "rejects %s before invoking Facebook",
    async (_description, credentials) => {
      mocks.getFacebookPublishingCredentials.mockResolvedValue(credentials);

      const { adapter, fetchMock } = createAdapter();

      const result = await adapter.publish(VALID_INPUT);

      expect(result).toEqual({
        outcome: "failed",
        postId: POST_ID,
        platform: "facebook",
        message:
          "Facebook Page publishing credentials are unavailable or unauthorized.",
      });

      // Authorization must happen first.
      expect(mocks.authorizeFacebookPublishing).toHaveBeenCalledOnce();

      // The requested Page connection is still
      // derived from the persisted post.
      expect(mocks.getFacebookPublishingCredentials).toHaveBeenCalledWith({
        authUser: AUTH_USER,
        workspaceId: WORKSPACE_ID,
        connectionId: CONNECTION_ID,
      });

      // Invalid credentials must never reach
      // the Facebook publishing service.
      expect(mocks.publishFacebookTextPost).not.toHaveBeenCalled();

      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("preserves definite Facebook publishing failures", async () => {
    mocks.publishFacebookTextPost.mockResolvedValue({
      outcome: "failed",
      message: "Facebook rejected the publishing request (HTTP 403).",
    });

    const { adapter } = createAdapter();

    const result = await adapter.publish(VALID_INPUT);

    expect(result).toEqual({
      outcome: "failed",
      postId: POST_ID,
      platform: "facebook",
      message: "Facebook rejected the publishing request (HTTP 403).",
    });
  });

  it("preserves uncertain Facebook publishing outcomes", async () => {
    mocks.publishFacebookTextPost.mockResolvedValue({
      outcome: "unknown",
      message: "Facebook publishing could not be confirmed.",
    });

    const { adapter } = createAdapter();

    const result = await adapter.publish(VALID_INPUT);

    expect(result).toEqual({
      outcome: "unknown",
      postId: POST_ID,
      platform: "facebook",
      message: "Facebook publishing could not be confirmed.",
    });
  });

  it("returns unknown if the publishing service throws", async () => {
    mocks.publishFacebookTextPost.mockRejectedValue(
      new Error("External request might have completed"),
    );

    const { adapter } = createAdapter();

    const result = await adapter.publish(VALID_INPUT);

    expect(result).toEqual({
      outcome: "unknown",
      postId: POST_ID,
      platform: "facebook",
      message:
        "Facebook publishing encountered an unexpected error. " +
        "Check Facebook before retrying.",
    });
  });

  it("does not invoke the HTTP transport directly", async () => {
    const { adapter, fetchMock } = createAdapter();

    await adapter.publish(VALID_INPUT);

    // The mocked low-level publishing service
    // receives fetchImpl but never invokes it.
    expect(fetchMock).not.toHaveBeenCalled();

    expect(mocks.publishFacebookTextPost).toHaveBeenCalledOnce();
  });
});
