import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserWorkspaceById: vi.fn(),
  isValidWorkspaceId: vi.fn(),

  postFindOne: vi.fn(),
  postSelect: vi.fn(),
  postLean: vi.fn(),
}));

vi.mock("../workspaceService.js", () => ({
  getUserWorkspaceById: mocks.getUserWorkspaceById,

  isValidWorkspaceId: mocks.isValidWorkspaceId,
}));

vi.mock("../../models/Post.js", () => ({
  default: {
    findOne: mocks.postFindOne,
  },
}));

import {
  authorizeFacebookPublishing,
  FacebookPublishingAuthorizationError,
} from "./facebookPublishingAuthorizationService.js";

const workspaceId = "507f1f77bcf86cd799439011";

const postId = "507f1f77bcf86cd799439012";

const facebookConnectionId = "507f1f77bcf86cd799439013";

const authUser = {
  id: "supabase-user-123",
  email: "test@example.com",
};

const input = {
  authUser,
  workspaceId,
  postId,
};

function createAuthorizedPost(overrides: Record<string, unknown> = {}) {
  return {
    _id: postId,
    workspaceId,

    platforms: ["facebook"],

    platformConnections: {
      facebook: facebookConnectionId,
    },

    status: "publishing",
    mediaIds: [],

    ...overrides,
  };
}

describe("authorizeFacebookPublishing", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.isValidWorkspaceId.mockImplementation((value: string) =>
      /^[a-f0-9]{24}$/i.test(value),
    );

    mocks.getUserWorkspaceById.mockResolvedValue({
      _id: workspaceId,
    });

    mocks.postLean.mockResolvedValue(createAuthorizedPost());

    mocks.postSelect.mockReturnValue({
      lean: mocks.postLean,
    });

    mocks.postFindOne.mockReturnValue({
      select: mocks.postSelect,
    });
  });

  it("authorizes a claimed Facebook-only text post", async () => {
    await expect(authorizeFacebookPublishing(input)).resolves.toBeUndefined();

    expect(mocks.getUserWorkspaceById).toHaveBeenCalledWith(
      authUser,
      workspaceId,
    );

    expect(mocks.postFindOne).toHaveBeenCalledWith({
      _id: postId,
      workspaceId,
    });

    expect(mocks.postSelect).toHaveBeenCalledWith(
      expect.stringContaining("platformConnections"),
    );

    expect(mocks.postLean).toHaveBeenCalledOnce();
  });

  it("rejects unauthenticated publishing", async () => {
    await expect(
      authorizeFacebookPublishing({
        ...input,
        authUser: {
          ...authUser,
          id: "   ",
        },
      }),
    ).rejects.toMatchObject({
      name: "FacebookPublishingAuthorizationError",
      statusCode: 401,
      message: "Authentication is required.",
    });

    expect(mocks.getUserWorkspaceById).not.toHaveBeenCalled();

    expect(mocks.postFindOne).not.toHaveBeenCalled();
  });

  it("rejects an invalid workspace ID", async () => {
    await expect(
      authorizeFacebookPublishing({
        ...input,
        workspaceId: "invalid-workspace",
      }),
    ).rejects.toMatchObject({
      name: "FacebookPublishingAuthorizationError",
      statusCode: 404,
      message: "Post or workspace not found.",
    });

    expect(mocks.getUserWorkspaceById).not.toHaveBeenCalled();

    expect(mocks.postFindOne).not.toHaveBeenCalled();
  });

  it("rejects an invalid post ID", async () => {
    await expect(
      authorizeFacebookPublishing({
        ...input,
        postId: "invalid-post",
      }),
    ).rejects.toMatchObject({
      name: "FacebookPublishingAuthorizationError",
      statusCode: 404,
      message: "Post or workspace not found.",
    });

    expect(mocks.getUserWorkspaceById).not.toHaveBeenCalled();

    expect(mocks.postFindOne).not.toHaveBeenCalled();
  });

  it("rejects unauthorized workspace access", async () => {
    mocks.getUserWorkspaceById.mockResolvedValue(null);

    await expect(authorizeFacebookPublishing(input)).rejects.toMatchObject({
      name: "FacebookPublishingAuthorizationError",
      statusCode: 404,
      message: "Workspace not found.",
    });

    expect(mocks.postFindOne).not.toHaveBeenCalled();
  });

  it("rejects a post missing from the authorized workspace", async () => {
    mocks.postLean.mockResolvedValue(null);

    await expect(authorizeFacebookPublishing(input)).rejects.toMatchObject({
      name: "FacebookPublishingAuthorizationError",
      statusCode: 404,
      message: "Post not found in this workspace.",
    });

    expect(mocks.postFindOne).toHaveBeenCalledOnce();
  });

  it.each([
    ["LinkedIn-only", ["linkedin"]],
    ["Instagram-only", ["instagram"]],
    ["Facebook and LinkedIn", ["facebook", "linkedin"]],
    ["Facebook and Instagram", ["facebook", "instagram"]],
  ])("rejects %s platform selection", async (_description, platforms) => {
    mocks.postLean.mockResolvedValue(
      createAuthorizedPost({
        platforms,
      }),
    );

    await expect(authorizeFacebookPublishing(input)).rejects.toMatchObject({
      name: "FacebookPublishingAuthorizationError",
      statusCode: 409,
      message: "This post is not configured for Facebook-only publishing.",
    });
  });

  it("rejects an unclaimed Facebook draft", async () => {
    mocks.postLean.mockResolvedValue(
      createAuthorizedPost({
        status: "draft",
      }),
    );

    await expect(authorizeFacebookPublishing(input)).rejects.toMatchObject({
      name: "FacebookPublishingAuthorizationError",
      statusCode: 409,
      message: "This post has not been claimed for publishing.",
    });
  });

  it("rejects an already published Facebook post", async () => {
    mocks.postLean.mockResolvedValue(
      createAuthorizedPost({
        status: "published",
      }),
    );

    await expect(authorizeFacebookPublishing(input)).rejects.toMatchObject({
      name: "FacebookPublishingAuthorizationError",
      statusCode: 409,
      message: "This post has not been claimed for publishing.",
    });
  });

  it("rejects a missing Facebook Page selection", async () => {
    mocks.postLean.mockResolvedValue(
      createAuthorizedPost({
        platformConnections: {},
      }),
    );

    await expect(authorizeFacebookPublishing(input)).rejects.toMatchObject({
      name: "FacebookPublishingAuthorizationError",
      statusCode: 409,
      message: "No Facebook Page was selected for this post.",
    });
  });

  it("rejects Facebook media attachments", async () => {
    mocks.postLean.mockResolvedValue(
      createAuthorizedPost({
        mediaIds: ["507f1f77bcf86cd799439014"],
      }),
    );

    await expect(authorizeFacebookPublishing(input)).rejects.toMatchObject({
      name: "FacebookPublishingAuthorizationError",
      statusCode: 409,
      message: "Facebook media publishing is not supported yet.",
    });
  });

  it("queries only the workspace returned by authorization", async () => {
    const authorizedWorkspace = {
      _id: {
        toString: () => workspaceId,
      },
    };

    mocks.getUserWorkspaceById.mockResolvedValue(authorizedWorkspace);

    await authorizeFacebookPublishing(input);

    expect(mocks.postFindOne).toHaveBeenCalledWith({
      _id: postId,
      workspaceId: authorizedWorkspace._id,
    });
  });

  it("loads only the fields required for authorization", async () => {
    await authorizeFacebookPublishing(input);

    const selectedFields = mocks.postSelect.mock.calls[0]?.[0] as string;

    expect(selectedFields).toContain("platforms");

    expect(selectedFields).toContain("platformConnections");

    expect(selectedFields).toContain("status");

    expect(selectedFields).toContain("mediaIds");
  });

  it("propagates unexpected database errors", async () => {
    const databaseError = new Error("MongoDB query failed.");

    mocks.postLean.mockRejectedValue(databaseError);

    await expect(authorizeFacebookPublishing(input)).rejects.toBe(
      databaseError,
    );

    expect(mocks.postFindOne).toHaveBeenCalledOnce();
  });

  it("uses the Facebook-specific authorization error type", async () => {
    mocks.getUserWorkspaceById.mockResolvedValue(null);

    await expect(authorizeFacebookPublishing(input)).rejects.toBeInstanceOf(
      FacebookPublishingAuthorizationError,
    );
  });
});
