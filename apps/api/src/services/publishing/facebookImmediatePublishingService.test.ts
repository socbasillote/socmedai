import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserWorkspaceById: vi.fn(),
  isValidWorkspaceId: vi.fn(),

  postFindOneAndUpdate: vi.fn(),
  postSelect: vi.fn(),
  postLean: vi.fn(),
}));

vi.mock("../workspaceService.js", () => ({
  getUserWorkspaceById: mocks.getUserWorkspaceById,

  isValidWorkspaceId: mocks.isValidWorkspaceId,
}));

vi.mock("../../models/Post.js", () => ({
  default: {
    findOneAndUpdate: mocks.postFindOneAndUpdate,
  },
}));

import {
  claimImmediateFacebookPost,
  FacebookImmediatePublishingError,
} from "./facebookImmediatePublishingService.js";

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

function createClaimedPost() {
  return {
    _id: postId,
    workspaceId,
    caption: "Storm Facebook announcement",
    platforms: ["facebook"],
    platformConnections: {
      facebook: facebookConnectionId,
    },
    mediaIds: [],
    status: "publishing",
    claimedAt: new Date("2026-10-30T00:00:00.000Z"),
    attemptCount: 1,
    platformResults: [],
  };
}

describe("claimImmediateFacebookPost", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.isValidWorkspaceId.mockImplementation((value: string) =>
      /^[a-f0-9]{24}$/i.test(value),
    );

    mocks.getUserWorkspaceById.mockResolvedValue({
      _id: workspaceId,
    });

    mocks.postLean.mockResolvedValue(createClaimedPost());

    mocks.postSelect.mockReturnValue({
      lean: mocks.postLean,
    });

    mocks.postFindOneAndUpdate.mockReturnValue({
      select: mocks.postSelect,
    });
  });

  it("claims an eligible Facebook-only text draft", async () => {
    const claimed = await claimImmediateFacebookPost(input);

    expect(claimed).toEqual(createClaimedPost());

    expect(mocks.getUserWorkspaceById).toHaveBeenCalledWith(
      authUser,
      workspaceId,
    );

    expect(mocks.postFindOneAndUpdate).toHaveBeenCalledOnce();
  });

  it("uses the complete atomic Facebook eligibility filter", async () => {
    await claimImmediateFacebookPost(input);

    expect(mocks.postFindOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: postId,
        workspaceId,

        // Only unpublished drafts.
        status: "draft",
        attemptCount: 0,
        claimedAt: { $exists: false },

        // Exact platform array excludes
        // LinkedIn, Instagram, and mixed posts.
        platforms: ["facebook"],

        // A saved Facebook Page is required.
        "platformConnections.facebook": {
          $exists: true,
          $ne: null,
        },

        // No images or videos yet.
        mediaIds: {
          $size: 0,
        },

        // Reject completed or uncertain
        // publishing result states.
        $or: [
          {
            platformResults: {
              $size: 0,
            },
          },
          {
            platformResults: {
              $elemMatch: {
                platform: "facebook",
                status: "pending",
              },
            },
          },
        ],
      },

      {
        $set: {
          status: "publishing",
          claimedAt: expect.any(Date),
        },

        $inc: {
          attemptCount: 1,
        },
      },

      {
        new: true,
        runValidators: true,
      },
    );
  });

  it("authorizes the workspace before attempting a claim", async () => {
    const events: string[] = [];

    mocks.getUserWorkspaceById.mockImplementation(async () => {
      events.push("authorize-workspace");

      return {
        _id: workspaceId,
      };
    });

    mocks.postFindOneAndUpdate.mockImplementation(() => {
      events.push("claim-post");

      return {
        select: mocks.postSelect,
      };
    });

    await claimImmediateFacebookPost(input);

    expect(events).toEqual(["authorize-workspace", "claim-post"]);
  });

  it("rejects unauthenticated publishing", async () => {
    await expect(
      claimImmediateFacebookPost({
        ...input,
        authUser: {
          ...authUser,
          id: "   ",
        },
      }),
    ).rejects.toMatchObject({
      name: "FacebookImmediatePublishingError",
      statusCode: 401,
      message: "Authentication is required.",
    });

    expect(mocks.getUserWorkspaceById).not.toHaveBeenCalled();

    expect(mocks.postFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("rejects an invalid workspace ID before querying MongoDB", async () => {
    await expect(
      claimImmediateFacebookPost({
        ...input,
        workspaceId: "invalid-workspace",
      }),
    ).rejects.toMatchObject({
      name: "FacebookImmediatePublishingError",
      statusCode: 404,
      message: "Post or workspace not found.",
    });

    expect(mocks.getUserWorkspaceById).not.toHaveBeenCalled();

    expect(mocks.postFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("rejects an invalid post ID before querying MongoDB", async () => {
    await expect(
      claimImmediateFacebookPost({
        ...input,
        postId: "invalid-post",
      }),
    ).rejects.toMatchObject({
      name: "FacebookImmediatePublishingError",
      statusCode: 404,
      message: "Post or workspace not found.",
    });

    expect(mocks.getUserWorkspaceById).not.toHaveBeenCalled();

    expect(mocks.postFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("rejects access to an unauthorized workspace", async () => {
    mocks.getUserWorkspaceById.mockResolvedValue(null);

    await expect(claimImmediateFacebookPost(input)).rejects.toMatchObject({
      name: "FacebookImmediatePublishingError",
      statusCode: 404,
      message: "Workspace not found.",
    });

    expect(mocks.postFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("scopes the claim to the authorized workspace document", async () => {
    const authorizedWorkspaceId = {
      toString: () => workspaceId,
    };

    mocks.getUserWorkspaceById.mockResolvedValue({
      _id: authorizedWorkspaceId,
    });

    await claimImmediateFacebookPost(input);

    const filter = mocks.postFindOneAndUpdate.mock.calls[0]?.[0];

    expect(filter.workspaceId).toBe(authorizedWorkspaceId);

    expect(filter._id).toBe(postId);
  });

  it("returns HTTP 409 when the post is not eligible", async () => {
    // MongoDB returns no matching post when
    // the eligibility filter rejects it.
    mocks.postLean.mockResolvedValue(null);

    await expect(claimImmediateFacebookPost(input)).rejects.toMatchObject({
      name: "FacebookImmediatePublishingError",
      statusCode: 409,
      message: expect.stringContaining(
        "not eligible for immediate Facebook publishing",
      ),
    });

    expect(mocks.postFindOneAndUpdate).toHaveBeenCalledOnce();
  });

  it("does not retry a failed atomic claim", async () => {
    mocks.postLean.mockResolvedValue(null);

    await expect(claimImmediateFacebookPost(input)).rejects.toBeInstanceOf(
      FacebookImmediatePublishingError,
    );

    // A failed claim must never result in
    // another implicit claim attempt.
    expect(mocks.postFindOneAndUpdate).toHaveBeenCalledTimes(1);

    expect(mocks.postLean).toHaveBeenCalledTimes(1);
  });

  it("propagates unexpected MongoDB errors", async () => {
    const databaseError = new Error("MongoDB connection interrupted.");

    mocks.postLean.mockRejectedValue(databaseError);

    await expect(claimImmediateFacebookPost(input)).rejects.toBe(databaseError);

    expect(mocks.postFindOneAndUpdate).toHaveBeenCalledOnce();
  });

  it("selects the fields required for publishing execution", async () => {
    await claimImmediateFacebookPost(input);

    expect(mocks.postSelect).toHaveBeenCalledOnce();

    const selectedFields = mocks.postSelect.mock.calls[0]?.[0];

    expect(selectedFields).toContain("platformConnections");

    expect(selectedFields).toContain("platformResults");

    expect(selectedFields).toContain("mediaIds");

    expect(selectedFields).toContain("claimedAt");

    expect(selectedFields).toContain("attemptCount");

    expect(mocks.postLean).toHaveBeenCalledOnce();
  });
});
