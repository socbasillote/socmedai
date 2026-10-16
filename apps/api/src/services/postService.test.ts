import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UpdateDraftPostInput } from "../schemas/postSchema.js";

const mocks = vi.hoisted(() => ({
  profileFindOne: vi.fn(),
  workspaceFindOne: vi.fn(),
  postCreate: vi.fn(),
  postFind: vi.fn(),
  postFindOne: vi.fn(),
  postDeleteOne: vi.fn(),
  postFindOneAndUpdate: vi.fn(),
}));

vi.mock("../models/UserProfile.js", () => ({
  default: {
    findOne: mocks.profileFindOne,
  },
}));

vi.mock("../models/Workspace.js", () => ({
  default: {
    findOne: mocks.workspaceFindOne,
  },
}));

vi.mock("../models/Post.js", () => ({
  default: {
    create: mocks.postCreate,
    find: mocks.postFind,
    findOne: mocks.postFindOne,
    deleteOne: mocks.postDeleteOne,
    findOneAndUpdate: mocks.postFindOneAndUpdate,
  },
}));

import {
  createWorkspacePost,
  listWorkspacePosts,
  deleteWorkspaceDraft,
  updateWorkspaceDraft,
  PostServiceError,
} from "./postService.js";

const authUser = {
  id: "supabase-user-123",
  email: "user@example.com",
};

const workspaceId = "507f1f77bcf86cd799439011";
const profileId = "507f1f77bcf86cd799439012";

function mockAuthorizedWorkspace() {
  mocks.profileFindOne.mockReturnValue({
    select: vi.fn().mockResolvedValue({ _id: profileId }),
  });

  mocks.workspaceFindOne.mockReturnValue({
    select: vi.fn().mockResolvedValue({ _id: workspaceId }),
  });
}

describe("postService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createWorkspacePost", () => {
    it("creates a draft with server-controlled ownership", async () => {
      mockAuthorizedWorkspace();

      mocks.postCreate.mockResolvedValue({
        toObject: () => ({
          _id: "507f1f77bcf86cd799439013",
          workspaceId,
          createdByUserId: profileId,
          caption: "Campaign launch",
          platforms: ["facebook"],
          status: "draft",
        }),
      });

      const result = await createWorkspacePost(authUser, {
        workspaceId,
        caption: "Campaign launch",
        platforms: ["facebook"],
        mediaIds: [],
      });

      expect(mocks.postCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: expect.anything(),
          createdByUserId: profileId,
          caption: "Campaign launch",
          platforms: ["facebook"],
          status: "draft",
          mediaIds: [],
        }),
      );

      expect(result.createdByUserId).toBe(profileId);
      expect(result.status).toBe("draft");
    });

    it("creates a scheduled post when a future time is provided", async () => {
      mockAuthorizedWorkspace();

      mocks.postCreate.mockImplementation(async (data) => ({
        toObject: () => data,
      }));

      const scheduledAt = "2099-01-01T00:00:00.000Z";

      const result = await createWorkspacePost(authUser, {
        workspaceId,
        caption: "Scheduled campaign",
        platforms: ["instagram"],
        mediaIds: [],
        scheduledAt,
      });

      expect(mocks.postCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "scheduled",
          scheduledAt: new Date(scheduledAt),
        }),
      );

      expect(result.status).toBe("scheduled");
    });

    it("returns 404 when the user has no profile", async () => {
      mocks.profileFindOne.mockReturnValue({
        select: vi.fn().mockResolvedValue(null),
      });

      await expect(
        createWorkspacePost(authUser, {
          workspaceId,
          caption: "Campaign launch",
          platforms: ["facebook"],
          mediaIds: [],
        }),
      ).rejects.toMatchObject({
        name: "PostServiceError",
        statusCode: 404,
      });

      expect(mocks.postCreate).not.toHaveBeenCalled();
    });

    it("returns 404 when the workspace is not owned by the user", async () => {
      mocks.profileFindOne.mockReturnValue({
        select: vi.fn().mockResolvedValue({ _id: profileId }),
      });

      mocks.workspaceFindOne.mockReturnValue({
        select: vi.fn().mockResolvedValue(null),
      });

      await expect(
        createWorkspacePost(authUser, {
          workspaceId,
          caption: "Campaign launch",
          platforms: ["facebook"],
          mediaIds: [],
        }),
      ).rejects.toBeInstanceOf(PostServiceError);

      expect(mocks.postCreate).not.toHaveBeenCalled();
    });

    it("rejects malformed workspace IDs without querying models", async () => {
      await expect(
        createWorkspacePost(authUser, {
          workspaceId: "invalid-id",
          caption: "Campaign launch",
          platforms: ["facebook"],
          mediaIds: [],
        }),
      ).rejects.toMatchObject({ statusCode: 404 });

      expect(mocks.profileFindOne).not.toHaveBeenCalled();
      expect(mocks.postCreate).not.toHaveBeenCalled();
    });

    it("rejects media attachments until media support exists", async () => {
      mockAuthorizedWorkspace();

      await expect(
        createWorkspacePost(authUser, {
          workspaceId,
          caption: "Campaign launch",
          platforms: ["facebook"],
          mediaIds: [profileId],
        }),
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(mocks.postCreate).not.toHaveBeenCalled();
    });
  });

  describe("listWorkspacePosts", () => {
    it("returns only posts from the authorized workspace", async () => {
      mockAuthorizedWorkspace();

      const expectedPosts = [
        { _id: "post-1", workspaceId, caption: "Campaign launch" },
      ];

      mocks.postFind.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(expectedPosts),
        }),
      });

      const result = await listWorkspacePosts(authUser, workspaceId);

      expect(mocks.postFind).toHaveBeenCalledWith({
        workspaceId: expect.anything(),
      });

      expect(result).toEqual(expectedPosts);
    });

    it("refuses to list posts from an unauthorized workspace", async () => {
      mocks.profileFindOne.mockReturnValue({
        select: vi.fn().mockResolvedValue({ _id: profileId }),
      });

      mocks.workspaceFindOne.mockReturnValue({
        select: vi.fn().mockResolvedValue(null),
      });

      await expect(
        listWorkspacePosts(authUser, workspaceId),
      ).rejects.toMatchObject({ statusCode: 404 });

      expect(mocks.postFind).not.toHaveBeenCalled();
    });
  });

  describe("deleteWorkspaceDraft", () => {
    const postId = "507f1f77bcf86cd799439013";

    function mockAuthorizedDraft() {
      mocks.profileFindOne.mockReturnValue({
        select: vi.fn().mockResolvedValue({ _id: profileId }),
      });

      mocks.postFindOne.mockReturnValue({
        select: vi.fn().mockResolvedValue({
          _id: postId,
          workspaceId,
          status: "draft",
        }),
      });

      mocks.workspaceFindOne.mockReturnValue({
        select: vi.fn().mockResolvedValue({ _id: workspaceId }),
      });

      mocks.postDeleteOne.mockResolvedValue({ deletedCount: 1 });
    }

    it("deletes an authorized draft", async () => {
      mockAuthorizedDraft();

      const result = await deleteWorkspaceDraft(authUser, postId);

      expect(mocks.postDeleteOne).toHaveBeenCalledWith({
        _id: postId,
        workspaceId,
        createdByUserId: profileId,
        status: "draft",
      });

      expect(result).toEqual({ id: postId });
    });

    it("rejects malformed post IDs without querying models", async () => {
      await expect(
        deleteWorkspaceDraft(authUser, "invalid-id"),
      ).rejects.toMatchObject({ statusCode: 404 });

      expect(mocks.profileFindOne).not.toHaveBeenCalled();
      expect(mocks.postFindOne).not.toHaveBeenCalled();
      expect(mocks.postDeleteOne).not.toHaveBeenCalled();
    });

    it("returns 404 when the post does not exist", async () => {
      mocks.profileFindOne.mockReturnValue({
        select: vi.fn().mockResolvedValue({ _id: profileId }),
      } as never);

      mocks.postFindOne.mockReturnValue({
        select: vi.fn().mockResolvedValue(null),
      });

      await expect(
        deleteWorkspaceDraft(authUser, postId),
      ).rejects.toMatchObject({ statusCode: 404 });

      expect(mocks.postDeleteOne).not.toHaveBeenCalled();
    });

    it("rejects scheduled posts", async () => {
      mockAuthorizedDraft();

      mocks.postFindOne.mockReturnValue({
        select: vi.fn().mockResolvedValue({
          _id: postId,
          workspaceId,
          status: "scheduled",
        }),
      });

      await expect(
        deleteWorkspaceDraft(authUser, postId),
      ).rejects.toMatchObject({
        statusCode: 409,
        message: "Only draft posts can be deleted.",
      });

      expect(mocks.postDeleteOne).not.toHaveBeenCalled();
    });

    it("rejects posts from a workspace the user does not own", async () => {
      mockAuthorizedDraft();

      mocks.workspaceFindOne.mockReturnValue({
        select: vi.fn().mockResolvedValue(null),
      });

      await expect(
        deleteWorkspaceDraft(authUser, postId),
      ).rejects.toMatchObject({ statusCode: 404 });

      expect(mocks.postDeleteOne).not.toHaveBeenCalled();
    });

    it("rejects deletion if the draft changed before deletion", async () => {
      mockAuthorizedDraft();

      mocks.postDeleteOne.mockResolvedValue({ deletedCount: 0 });

      await expect(
        deleteWorkspaceDraft(authUser, postId),
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });
});

describe("updateWorkspaceDraft", () => {
  const postId = "507f1f77bcf86cd799439012";
  const workspaceId = "507f1f77bcf86cd799439011";
  const userId = "supabase-user-123";

  const existingDraft = {
    _id: postId,
    workspaceId,
    createdByUserId: userId,
    title: "Original title",
    caption: "Original caption",
    mediaIds: [],
    platforms: ["facebook"],
    status: "draft",
    scheduledAt: null,
    publishedAt: null,
  };

  const updatedDraft = {
    ...existingDraft,
    title: "Updated title",
    caption: "Updated caption",
    platforms: ["facebook", "linkedin"],
  };

  const authenticatedUser = {
    id: userId,
    email: "creator@example.com",
  };

  const updateInput: UpdateDraftPostInput = {
    title: "Updated title",
    caption: "Updated caption",
    platforms: ["instagram", "linkedin"],
  };

  it("updates an existing draft", async () => {
    mocks.profileFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({ _id: profileId }),
    } as never);

    mocks.postFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        _id: postId,
        workspaceId,
        status: "draft",
      }),
    } as never);

    mocks.workspaceFindOne.mockResolvedValue({
      _id: workspaceId,
      ownerUserId: userId,
    } as never);

    const query = {
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(updatedDraft),
    };

    mocks.postFindOneAndUpdate.mockReturnValue(query as never);

    mocks.workspaceFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({ _id: workspaceId }),
    } as never);

    const result = await updateWorkspaceDraft(
      authenticatedUser,
      postId,
      updateInput,
    );

    expect(result).toEqual(updatedDraft);
    expect(mocks.postFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: postId,
        workspaceId,
        createdByUserId: profileId,
        status: "draft",
      }),
      {
        $set: updateInput,
      },
      expect.objectContaining({
        new: true,
        runValidators: true,
      }),
    );
  });

  it("rejects an invalid post ID", async () => {
    await expect(
      updateWorkspaceDraft(authenticatedUser, "invalid-id", updateInput),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejects a post that does not exist or belong to the user", async () => {
    mocks.profileFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({ _id: profileId }),
    } as never);

    mocks.postFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue(null),
    } as never);

    await expect(
      updateWorkspaceDraft(authenticatedUser, postId, updateInput),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejects updates to a non-draft post", async () => {
    mocks.profileFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({ _id: profileId }),
    } as never);

    mocks.postFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        _id: postId,
        workspaceId,
        status: "scheduled",
      }),
    } as never);

    await expect(
      updateWorkspaceDraft(authenticatedUser, postId, updateInput),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects a draft whose workspace the user does not own", async () => {
    mocks.profileFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({ _id: profileId }),
    } as never);

    mocks.postFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        _id: postId,
        workspaceId,
        status: "draft",
      }),
    } as never);

    mocks.workspaceFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue(null),
    } as never);

    await expect(
      updateWorkspaceDraft(authenticatedUser, postId, updateInput),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
