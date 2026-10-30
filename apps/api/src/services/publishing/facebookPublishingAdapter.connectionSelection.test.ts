import { beforeEach, describe, expect, it, vi } from "vitest";

import { FacebookPublishingAdapter } from "./facebookPublishingAdapter.js";

const mocks = vi.hoisted(() => ({
  postFindOne: vi.fn(),
  getUserWorkspaceById: vi.fn(),
  isValidWorkspaceId: vi.fn(),
  getFacebookPublishingCredentials: vi.fn(),
  publishFacebookTextPost: vi.fn(),
  authorizeFacebookPublishing: vi.fn(),
}));

vi.mock("../../models/Post.js", () => ({
  default: {
    findOne: mocks.postFindOne,
  },
}));

vi.mock("../workspaceService.js", () => ({
  getUserWorkspaceById: mocks.getUserWorkspaceById,
  isValidWorkspaceId: mocks.isValidWorkspaceId,
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

const workspaceId = "507f1f77bcf86cd799439011";
const postId = "507f1f77bcf86cd799439012";

const facebookConnectionId = "507f1f77bcf86cd799439013";

const differentConnectionId = "507f1f77bcf86cd799439014";

const authUser = {
  id: "supabase-user-123",
  email: "test@example.com",
};

const baseInput = {
  postId,
  workspaceId,
  platform: "facebook" as const,
  caption: "Storm Facebook announcement",
  mediaIds: [],
};

// Never allow a real external HTTP request in these tests.
const fetchMock = vi.fn<typeof fetch>(async () => {
  throw new Error("External HTTP requests are forbidden in unit tests.");
});

function mockSavedPost(facebookConnection?: string) {
  const post = {
    _id: postId,
    workspaceId,
    caption: "Storm Facebook announcement",
    mediaIds: [],
    platforms: ["facebook"],
    platformConnections: facebookConnection
      ? {
          facebook: facebookConnection,
        }
      : {},
  };

  const lean = vi.fn().mockResolvedValue(post);
  const select = vi.fn().mockReturnValue({ lean });

  mocks.postFindOne.mockReturnValue({ select });

  return { post, select, lean };
}

describe("FacebookPublishingAdapter connection selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.isValidWorkspaceId.mockReturnValue(true);

    mocks.getUserWorkspaceById.mockResolvedValue({
      _id: workspaceId,
    });

    mockSavedPost(facebookConnectionId);

    mocks.getFacebookPublishingCredentials.mockResolvedValue({
      connectionId: facebookConnectionId,
      facebookPageId: "123456789",
      pageAccessToken: "mock-facebook-page-access-token",
    });

    mocks.publishFacebookTextPost.mockResolvedValue({
      outcome: "published",
      externalPostId: "facebook-page-123_456",
    });

    mocks.authorizeFacebookPublishing.mockResolvedValue(undefined);
  });

  it("accepts a matching Facebook connection ID", async () => {
    const adapter = new FacebookPublishingAdapter(authUser, fetchMock);

    const result = await adapter.publish({
      ...baseInput,
      connectionId: facebookConnectionId,
    });

    expect(mocks.getFacebookPublishingCredentials).toHaveBeenCalledWith(
      expect.objectContaining({
        authUser,
        workspaceId,
        connectionId: facebookConnectionId,
      }),
    );

    expect(mocks.publishFacebookTextPost).toHaveBeenCalledOnce();

    expect(result).toMatchObject({
      outcome: "published",
      postId,
      platform: "facebook",
      externalPostId: "facebook-page-123_456",
    });
  });

  it("rejects a mismatched connection before credential retrieval", async () => {
    const adapter = new FacebookPublishingAdapter(authUser, fetchMock);

    const result = await adapter.publish({
      ...baseInput,
      connectionId: differentConnectionId,
    });

    expect(result).toEqual({
      outcome: "failed",
      postId,
      platform: "facebook",
      message: "The selected Facebook Page does not match this post.",
    });

    expect(mocks.getFacebookPublishingCredentials).not.toHaveBeenCalled();

    expect(mocks.publishFacebookTextPost).not.toHaveBeenCalled();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the persisted Facebook Page when connectionId is omitted", async () => {
    const adapter = new FacebookPublishingAdapter(authUser, fetchMock);

    const result = await adapter.publish({
      ...baseInput,
    });

    expect(mocks.getFacebookPublishingCredentials).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: facebookConnectionId,
        workspaceId,
      }),
    );

    expect(result.outcome).toBe("published");

    expect(mocks.publishFacebookTextPost).toHaveBeenCalledOnce();
  });

  it("rejects publishing when no Facebook Page is saved", async () => {
    mockSavedPost();

    const adapter = new FacebookPublishingAdapter(authUser, fetchMock);

    const result = await adapter.publish({
      ...baseInput,
      connectionId: facebookConnectionId,
    });

    expect(result).toMatchObject({
      outcome: "failed",
      postId,
      platform: "facebook",
    });

    expect(mocks.getFacebookPublishingCredentials).not.toHaveBeenCalled();

    expect(mocks.publishFacebookTextPost).not.toHaveBeenCalled();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
