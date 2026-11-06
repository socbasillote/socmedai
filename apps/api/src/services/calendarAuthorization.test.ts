import { afterEach, describe, expect, it, vi } from "vitest";

import UserProfile from "../models/UserProfile.js";
import Workspace from "../models/Workspace.js";
import Post from "../models/Post.js";

import type { AuthenticatedUser } from "./userProfileService.js";

import { listWorkspaceCalendarPosts, PostServiceError } from "./postService.js";

const workspaceId = "507f1f77bcf86cd799439011";
const profileId = "507f191e810c19729de860ea";

const authUser = {
  id: "test-auth-user",
} as AuthenticatedUser;

const range = {
  start: "2026-11-01T00:00:00.000Z",
  end: "2026-12-01T00:00:00.000Z",
};

function mockProfile(profile: unknown) {
  return vi.spyOn(UserProfile, "findOne").mockReturnValue({
    select: vi.fn().mockResolvedValue(profile),
  } as never);
}

function mockWorkspace(workspace: unknown) {
  return vi.spyOn(Workspace, "findOne").mockReturnValue({
    select: vi.fn().mockResolvedValue(workspace),
  } as never);
}

function mockCalendarPosts() {
  return vi.spyOn(Post, "find").mockReturnValue({
    select: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  } as never);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("calendar workspace authorization", () => {
  it("rejects an invalid workspace ID", async () => {
    const postFind = mockCalendarPosts();

    await expect(
      listWorkspaceCalendarPosts(authUser, "invalid-id", range),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(postFind).not.toHaveBeenCalled();
  });

  it("rejects a user without a profile", async () => {
    mockProfile(null);
    const postFind = mockCalendarPosts();

    await expect(
      listWorkspaceCalendarPosts(authUser, workspaceId, range),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(postFind).not.toHaveBeenCalled();
  });

  it("rejects an inaccessible workspace", async () => {
    mockProfile({ _id: profileId });
    const workspaceFind = mockWorkspace(null);
    const postFind = mockCalendarPosts();

    await expect(
      listWorkspaceCalendarPosts(authUser, workspaceId, range),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(workspaceFind).toHaveBeenCalledWith({
      _id: workspaceId,
      ownerUserId: profileId,
    });

    expect(postFind).not.toHaveBeenCalled();
  });

  it("queries posts only after authorization", async () => {
    mockProfile({ _id: profileId });

    mockWorkspace({
      _id: workspaceId,
      ownerUserId: profileId,
    });

    const postFind = mockCalendarPosts();

    const result = await listWorkspaceCalendarPosts(
      authUser,
      workspaceId,
      range,
    );

    expect(postFind).toHaveBeenCalledOnce();

    expect(postFind.mock.calls[0]?.[0]).toMatchObject({
      workspaceId,
    });

    expect(result.posts).toEqual([]);
  });

  it("uses the existing workspace error class", () => {
    const error = new PostServiceError("Workspace not found.", 404);

    expect(error.statusCode).toBe(404);
  });
});
