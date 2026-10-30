import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),

  postFindOneAndUpdate: vi.fn(),
  postSelect: vi.fn(),
  postLean: vi.fn(),
  postUpdateOne: vi.fn(),

  createPublishingAdapter: vi.fn(),

  orchestratorConstructor: vi.fn(),
  processPost: vi.fn(),
}));

vi.mock("../../models/Post.js", () => ({
  default: {
    findOneAndUpdate: mocks.postFindOneAndUpdate,
    updateOne: mocks.postUpdateOne,
  },
}));

vi.mock("./publishingAuthorizationService.js", () => ({
  authorizePublishing: mocks.authorize,

  PublishingAuthorizationError: class PublishingAuthorizationError extends Error {
    constructor(
      message: string,
      public readonly statusCode: number,
    ) {
      super(message);
      this.name = "PublishingAuthorizationError";
    }
  },
}));

vi.mock("./publishingAdapterFactory.js", () => ({
  createPublishingAdapter: mocks.createPublishingAdapter,
}));

vi.mock("./publishingOrchestrator.js", () => ({
  PublishingOrchestrator: class {
    constructor(adapter: unknown) {
      mocks.orchestratorConstructor(adapter);
    }

    processPost(post: unknown) {
      return mocks.processPost(post);
    }
  },
}));

import {
  claimImmediatePost,
  ImmediatePublishingError,
  publishImmediatePost,
} from "./immediatePublishingService.js";

import { PublishingAuthorizationError } from "./publishingAuthorizationService.js";

const workspaceId = "507f1f77bcf86cd799439011";

const postId = "507f1f77bcf86cd799439012";

const linkedinConnectionId = "507f1f77bcf86cd799439013";

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
    caption: "Storm LinkedIn announcement",
    platforms: ["linkedin"],
    platformConnections: {
      linkedin: linkedinConnectionId,
    },
    mediaIds: [],
    status: "publishing",
    attemptCount: 1,
    platformResults: [],
  };
}

describe("immediatePublishingService claim protection", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.authorize.mockResolvedValue(undefined);

    mocks.postSelect.mockReturnValue({
      lean: mocks.postLean,
    });

    mocks.postFindOneAndUpdate.mockReturnValue({
      select: mocks.postSelect,
    });

    mocks.postLean.mockResolvedValue(createClaimedPost());

    mocks.postUpdateOne.mockResolvedValue({
      matchedCount: 1,
      modifiedCount: 1,
    });

    mocks.createPublishingAdapter.mockReturnValue({
      publish: vi.fn(),
    });

    mocks.processPost.mockResolvedValue({
      postId,
      results: [],
    });
  });

  it("authorizes the request before claiming a post", async () => {
    const events: string[] = [];

    mocks.authorize.mockImplementation(async () => {
      events.push("authorize");
    });

    mocks.postFindOneAndUpdate.mockImplementation(() => {
      events.push("claim");

      return {
        select: mocks.postSelect,
      };
    });

    await claimImmediatePost(input);

    expect(events).toEqual(["authorize", "claim"]);

    expect(mocks.authorize).toHaveBeenCalledWith({
      authUser,
      workspaceId,
      postId,
    });
  });

  it("uses an atomic LinkedIn-only eligibility filter", async () => {
    const post = await claimImmediatePost(input);

    expect(post).toEqual(createClaimedPost());

    expect(mocks.postFindOneAndUpdate).toHaveBeenCalledOnce();

    expect(mocks.postFindOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: postId,
        workspaceId,
        status: "draft",

        // Exact array equality excludes
        // Facebook-only and mixed-platform posts.
        platforms: ["linkedin"],

        "platformConnections.linkedin": {
          $exists: true,
          $ne: null,
        },

        // Media attachments remain unsupported.
        mediaIds: {
          $size: 0,
        },

        // Only eligible platform-result states
        // may enter the publishing workflow.
        $or: [
          {
            platformResults: {
              $size: 0,
            },
          },
          {
            platformResults: {
              $elemMatch: {
                platform: "linkedin",
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

    expect(mocks.postSelect).toHaveBeenCalledWith(
      expect.stringContaining("platformConnections"),
    );
  });

  it("rejects unauthorized publishing before the database claim", async () => {
    mocks.authorize.mockRejectedValue(
      new PublishingAuthorizationError("Workspace not found.", 404),
    );

    await expect(claimImmediatePost(input)).rejects.toMatchObject({
      name: "ImmediatePublishingError",
      message: "Workspace not found.",
      statusCode: 404,
    });

    expect(mocks.postFindOneAndUpdate).not.toHaveBeenCalled();

    expect(mocks.createPublishingAdapter).not.toHaveBeenCalled();
  });

  it("preserves unexpected authorization errors", async () => {
    const error = new Error("Unexpected authorization failure.");

    mocks.authorize.mockRejectedValue(error);

    await expect(claimImmediatePost(input)).rejects.toBe(error);

    expect(mocks.postFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("returns HTTP 409 when no eligible post can be claimed", async () => {
    mocks.postLean.mockResolvedValue(null);

    await expect(claimImmediatePost(input)).rejects.toMatchObject({
      name: "ImmediatePublishingError",
      statusCode: 409,
      message: expect.stringContaining(
        "not eligible for immediate LinkedIn publishing",
      ),
    });

    expect(mocks.authorize).toHaveBeenCalledOnce();

    expect(mocks.postFindOneAndUpdate).toHaveBeenCalledOnce();
  });

  it("never creates a publishing adapter when the claim fails", async () => {
    mocks.postLean.mockResolvedValue(null);

    await expect(publishImmediatePost(input)).rejects.toBeInstanceOf(
      ImmediatePublishingError,
    );

    expect(mocks.createPublishingAdapter).not.toHaveBeenCalled();

    expect(mocks.orchestratorConstructor).not.toHaveBeenCalled();

    expect(mocks.processPost).not.toHaveBeenCalled();

    expect(mocks.postUpdateOne).not.toHaveBeenCalled();
  });

  it("uses the factory and orchestrator after a successful claim", async () => {
    const adapter = {
      publish: vi.fn(),
    };

    const claimedPost = createClaimedPost();

    const expectedResult = {
      postId,
      results: [
        {
          outcome: "simulated" as const,
          postId,
          platform: "linkedin" as const,
          simulatedAt: new Date("2026-10-30T00:00:00.000Z"),
          message: "LinkedIn dry run completed.",
        },
      ],
    };

    mocks.postLean.mockResolvedValue(claimedPost);

    mocks.createPublishingAdapter.mockReturnValue(adapter);

    mocks.processPost.mockResolvedValue(expectedResult);

    const result = await publishImmediatePost(input);

    expect(mocks.createPublishingAdapter).toHaveBeenCalledOnce();

    expect(mocks.createPublishingAdapter).toHaveBeenCalledWith(authUser);

    expect(mocks.orchestratorConstructor).toHaveBeenCalledWith(adapter);

    expect(mocks.processPost).toHaveBeenCalledOnce();

    expect(mocks.processPost).toHaveBeenCalledWith(claimedPost);

    expect(result).toBe(expectedResult);

    expect(mocks.postUpdateOne).not.toHaveBeenCalled();
  });

  it("records an interrupted publishing attempt without retrying", async () => {
    const error = new Error("Publishing execution interrupted.");

    mocks.processPost.mockRejectedValue(error);

    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      await expect(publishImmediatePost(input)).rejects.toMatchObject({
        name: "ImmediatePublishingError",
        statusCode: 500,
        message: expect.stringContaining("outcome may be unknown"),
      });

      expect(mocks.processPost).toHaveBeenCalledOnce();

      expect(mocks.postFindOneAndUpdate).toHaveBeenCalledOnce();

      expect(mocks.postUpdateOne).toHaveBeenCalledWith(
        {
          _id: postId,
          workspaceId,
          status: "publishing",
        },
        {
          $set: {
            lastError: expect.stringContaining("Check LinkedIn"),
          },
        },
      );

      expect(consoleError).toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("still reports interruption when saving the error fails", async () => {
    mocks.processPost.mockRejectedValue(new Error("Publishing interrupted."));

    mocks.postUpdateOne.mockRejectedValue(
      new Error("Database temporarily unavailable."),
    );

    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      await expect(publishImmediatePost(input)).rejects.toMatchObject({
        name: "ImmediatePublishingError",
        statusCode: 500,
        message: expect.stringContaining("outcome may be unknown"),
      });

      expect(mocks.postUpdateOne).toHaveBeenCalledOnce();

      expect(mocks.processPost).toHaveBeenCalledOnce();

      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining("Failed to record interrupted publishing"),
        expect.any(Error),
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
