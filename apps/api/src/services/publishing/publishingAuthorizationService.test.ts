import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserWorkspaceById: vi.fn(),
  isValidWorkspaceId: vi.fn(),
  findOne: vi.fn(),
}));

vi.mock("../workspaceService.js", () => ({
  getUserWorkspaceById: mocks.getUserWorkspaceById,
  isValidWorkspaceId: mocks.isValidWorkspaceId,
}));

vi.mock("../../models/Post.js", () => ({
  default: {
    findOne: mocks.findOne,
  },
}));

import {
  authorizePublishing,
  PublishingAuthorizationError,
} from "./publishingAuthorizationService.js";

describe("authorizePublishing", () => {
  const authUser = {
    id: "supabase-user-123",
    email: "test@example.com",
  };

  const input = {
    authUser,
    workspaceId: "workspace-123",
    postId: "post-123",
  };

  const workspace = {
    _id: "workspace-123",
  };

  function mockPost(
    post: {
      _id: string;
      workspaceId: string;
      platforms: string[];
    } | null,
  ) {
    const lean = vi.fn().mockResolvedValue(post);
    const select = vi.fn().mockReturnValue({ lean });

    mocks.findOne.mockReturnValue({ select });

    return { select, lean };
  }

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.isValidWorkspaceId.mockReturnValue(true);

    mocks.getUserWorkspaceById.mockResolvedValue(workspace);

    mockPost({
      _id: "post-123",
      workspaceId: "workspace-123",
      platforms: ["linkedin"],
    });
  });

  it("authorizes a post belonging to the user's workspace", async () => {
    await expect(authorizePublishing(input)).resolves.toBeUndefined();

    expect(mocks.getUserWorkspaceById).toHaveBeenCalledWith(
      authUser,
      "workspace-123",
    );

    expect(mocks.findOne).toHaveBeenCalledWith({
      _id: "post-123",
      workspaceId: "workspace-123",
    });
  });

  it("rejects missing authentication", async () => {
    await expect(
      authorizePublishing({
        ...input,
        authUser: {
          ...authUser,
          id: " ",
        },
      }),
    ).rejects.toMatchObject({
      name: "PublishingAuthorizationError",
      statusCode: 401,
    });

    expect(mocks.getUserWorkspaceById).not.toHaveBeenCalled();
    expect(mocks.findOne).not.toHaveBeenCalled();
  });

  it("rejects an invalid workspace ID", async () => {
    mocks.isValidWorkspaceId.mockImplementation(
      (id: string) => id !== "invalid-workspace",
    );

    await expect(
      authorizePublishing({
        ...input,
        workspaceId: "invalid-workspace",
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(mocks.getUserWorkspaceById).not.toHaveBeenCalled();
    expect(mocks.findOne).not.toHaveBeenCalled();
  });

  it("rejects an invalid post ID", async () => {
    mocks.isValidWorkspaceId.mockImplementation(
      (id: string) => id !== "invalid-post",
    );

    await expect(
      authorizePublishing({
        ...input,
        postId: "invalid-post",
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(mocks.getUserWorkspaceById).not.toHaveBeenCalled();
    expect(mocks.findOne).not.toHaveBeenCalled();
  });

  it("rejects an unauthorized workspace", async () => {
    mocks.getUserWorkspaceById.mockResolvedValue(null);

    await expect(authorizePublishing(input)).rejects.toMatchObject({
      statusCode: 404,
      message: "Workspace not found.",
    });

    expect(mocks.findOne).not.toHaveBeenCalled();
  });

  it("rejects a missing post", async () => {
    mockPost(null);

    await expect(authorizePublishing(input)).rejects.toMatchObject({
      statusCode: 404,
      message: "Post not found in this workspace.",
    });
  });

  it("rejects a post belonging to another workspace", async () => {
    mockPost(null);

    await expect(authorizePublishing(input)).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(mocks.findOne).toHaveBeenCalledWith({
      _id: "post-123",
      workspaceId: "workspace-123",
    });
  });

  it("rejects a post not configured for LinkedIn", async () => {
    mockPost({
      _id: "post-123",
      workspaceId: "workspace-123",
      platforms: ["facebook", "instagram"],
    });

    await expect(authorizePublishing(input)).rejects.toMatchObject({
      statusCode: 409,
      message: "This post is not configured for LinkedIn publishing.",
    });
  });

  it("returns the expected authorization error type", async () => {
    mocks.getUserWorkspaceById.mockResolvedValue(null);

    await expect(authorizePublishing(input)).rejects.toBeInstanceOf(
      PublishingAuthorizationError,
    );
  });
});
