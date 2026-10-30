import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PublishingAdapter } from "./publishingAdapter.js";

const mocks = vi.hoisted(() => ({
  claimImmediateFacebookPost: vi.fn(),

  createPublishingAdapter: vi.fn(),

  orchestratorConstructor: vi.fn(),
  processPost: vi.fn(),

  postUpdateOne: vi.fn(),
}));

// Mock the Facebook claim service.
// No real MongoDB claim occurs.
vi.mock("./facebookImmediatePublishingService.js", () => ({
  claimImmediateFacebookPost: mocks.claimImmediateFacebookPost,

  FacebookImmediatePublishingError: class FacebookImmediatePublishingError extends Error {
    constructor(
      message: string,
      public readonly statusCode: number,
    ) {
      super(message);
      this.name = "FacebookImmediatePublishingError";
    }
  },
}));

// Mock the adapter factory.
// No real Facebook or LinkedIn adapter is created.
vi.mock("./publishingAdapterFactory.js", () => ({
  createPublishingAdapter: mocks.createPublishingAdapter,
}));

// Mock the orchestrator.
// No external publishing requests occur.
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

// Mock persistence used for interruption handling.
vi.mock("../../models/Post.js", () => ({
  default: {
    updateOne: mocks.postUpdateOne,
  },
}));

import { publishImmediateFacebookPost } from "./facebookImmediatePublishingExecutionService.js";

import { FacebookImmediatePublishingError } from "./facebookImmediatePublishingService.js";

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
    caption: "Storm Facebook publishing test",
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

function createMockFacebookAdapter(): PublishingAdapter {
  return {
    publish: vi.fn(async (request) => ({
      outcome: "failed" as const,
      postId: request.postId,
      platform: request.platform,
      message: "Facebook publishing is mocked in this test.",
    })),
  };
}

describe("publishImmediateFacebookPost", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.claimImmediateFacebookPost.mockResolvedValue(createClaimedPost());

    mocks.createPublishingAdapter.mockReturnValue({
      publish: vi.fn(),
    });

    mocks.processPost.mockResolvedValue({
      postId,
      results: [],
    });

    mocks.postUpdateOne.mockResolvedValue({
      matchedCount: 1,
      modifiedCount: 1,
    });
  });

  it("rejects publishing when no options are provided", async () => {
    await expect(publishImmediateFacebookPost(input)).rejects.toMatchObject({
      name: "FacebookImmediatePublishingError",
      statusCode: 409,
      message: "Facebook publishing is not enabled.",
    });

    expect(mocks.claimImmediateFacebookPost).not.toHaveBeenCalled();

    expect(mocks.createPublishingAdapter).not.toHaveBeenCalled();

    expect(mocks.processPost).not.toHaveBeenCalled();

    expect(mocks.postUpdateOne).not.toHaveBeenCalled();
  });

  it("rejects an adapter without explicit activation", async () => {
    const facebookAdapter = createMockFacebookAdapter();

    await expect(
      publishImmediateFacebookPost(input, {
        adapter: facebookAdapter,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Facebook publishing is not enabled.",
    });

    expect(mocks.claimImmediateFacebookPost).not.toHaveBeenCalled();

    expect(facebookAdapter.publish).not.toHaveBeenCalled();
  });

  it("rejects activation without a Facebook adapter", async () => {
    await expect(
      publishImmediateFacebookPost(input, {
        enabled: true,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Facebook publishing is not enabled.",
    });

    expect(mocks.claimImmediateFacebookPost).not.toHaveBeenCalled();

    expect(mocks.processPost).not.toHaveBeenCalled();
  });

  it("rejects an explicitly disabled configuration", async () => {
    const facebookAdapter = createMockFacebookAdapter();

    await expect(
      publishImmediateFacebookPost(input, {
        enabled: false,
        adapter: facebookAdapter,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(mocks.claimImmediateFacebookPost).not.toHaveBeenCalled();

    expect(facebookAdapter.publish).not.toHaveBeenCalled();
  });

  it("requires the activation flag to be exactly true", async () => {
    const facebookAdapter = createMockFacebookAdapter();

    await expect(
      publishImmediateFacebookPost(input, {
        enabled: "true" as unknown as boolean,
        adapter: facebookAdapter,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Facebook publishing is not enabled.",
    });

    expect(mocks.claimImmediateFacebookPost).not.toHaveBeenCalled();

    expect(facebookAdapter.publish).not.toHaveBeenCalled();
  });

  it("claims and orchestrates an explicitly enabled Facebook post", async () => {
    const facebookAdapter = createMockFacebookAdapter();

    const routerAdapter = {
      publish: vi.fn(),
    };

    const claimedPost = createClaimedPost();

    const expectedResult = {
      postId,
      results: [
        {
          outcome: "simulated" as const,
          postId,
          platform: "facebook" as const,
          simulatedAt: new Date("2026-10-30T00:00:00.000Z"),
          message: "Facebook dry run completed.",
        },
      ],
    };

    mocks.claimImmediateFacebookPost.mockResolvedValue(claimedPost);

    mocks.createPublishingAdapter.mockReturnValue(routerAdapter);

    mocks.processPost.mockResolvedValue(expectedResult);

    const result = await publishImmediateFacebookPost(input, {
      enabled: true,
      adapter: facebookAdapter,
    });

    expect(mocks.claimImmediateFacebookPost).toHaveBeenCalledOnce();

    expect(mocks.claimImmediateFacebookPost).toHaveBeenCalledWith(input);

    expect(mocks.createPublishingAdapter).toHaveBeenCalledOnce();

    expect(mocks.createPublishingAdapter).toHaveBeenCalledWith(authUser, {
      facebook: {
        enabled: true,
        adapter: facebookAdapter,
      },
    });

    expect(mocks.orchestratorConstructor).toHaveBeenCalledWith(routerAdapter);

    expect(mocks.processPost).toHaveBeenCalledOnce();

    expect(mocks.processPost).toHaveBeenCalledWith(claimedPost);

    expect(result).toBe(expectedResult);

    expect(mocks.postUpdateOne).not.toHaveBeenCalled();

    // The mocked orchestrator must not invoke
    // the supplied Facebook adapter directly.
    expect(facebookAdapter.publish).not.toHaveBeenCalled();
  });

  it("preserves an unknown publishing result without retrying", async () => {
    const facebookAdapter = createMockFacebookAdapter();

    const unknownResult = {
      postId,
      results: [
        {
          outcome: "unknown" as const,
          postId,
          platform: "facebook" as const,
          message: "Facebook publishing outcome is uncertain.",
        },
      ],
    };

    mocks.processPost.mockResolvedValue(unknownResult);

    const result = await publishImmediateFacebookPost(input, {
      enabled: true,
      adapter: facebookAdapter,
    });

    expect(result).toBe(unknownResult);

    expect(result.results[0]?.outcome).toBe("unknown");

    expect(mocks.claimImmediateFacebookPost).toHaveBeenCalledOnce();

    expect(mocks.processPost).toHaveBeenCalledOnce();

    expect(mocks.postUpdateOne).not.toHaveBeenCalled();
  });

  it("preserves authorization and eligibility errors from the claim", async () => {
    const facebookAdapter = createMockFacebookAdapter();

    const claimError = new FacebookImmediatePublishingError(
      "Workspace not found.",
      404,
    );

    mocks.claimImmediateFacebookPost.mockRejectedValue(claimError);

    await expect(
      publishImmediateFacebookPost(input, {
        enabled: true,
        adapter: facebookAdapter,
      }),
    ).rejects.toBe(claimError);

    expect(mocks.createPublishingAdapter).not.toHaveBeenCalled();

    expect(mocks.processPost).not.toHaveBeenCalled();

    expect(mocks.postUpdateOne).not.toHaveBeenCalled();
  });

  it("does not hide unexpected errors before a successful claim", async () => {
    const facebookAdapter = createMockFacebookAdapter();

    const databaseError = new Error("MongoDB connection failed.");

    mocks.claimImmediateFacebookPost.mockRejectedValue(databaseError);

    await expect(
      publishImmediateFacebookPost(input, {
        enabled: true,
        adapter: facebookAdapter,
      }),
    ).rejects.toBe(databaseError);

    expect(mocks.claimImmediateFacebookPost).toHaveBeenCalledOnce();

    expect(mocks.createPublishingAdapter).not.toHaveBeenCalled();

    expect(mocks.postUpdateOne).not.toHaveBeenCalled();
  });

  it("records an interrupted publishing execution", async () => {
    const facebookAdapter = createMockFacebookAdapter();

    mocks.processPost.mockRejectedValue(
      new Error("Publishing execution interrupted."),
    );

    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      await expect(
        publishImmediateFacebookPost(input, {
          enabled: true,
          adapter: facebookAdapter,
        }),
      ).rejects.toMatchObject({
        name: "FacebookImmediatePublishingError",
        statusCode: 500,
        message: expect.stringContaining("outcome may be unknown"),
      });

      expect(mocks.claimImmediateFacebookPost).toHaveBeenCalledOnce();

      expect(mocks.processPost).toHaveBeenCalledOnce();

      expect(mocks.postUpdateOne).toHaveBeenCalledOnce();

      expect(mocks.postUpdateOne).toHaveBeenCalledWith(
        {
          _id: postId,
          workspaceId,
          status: "publishing",
        },
        {
          $set: {
            lastError: expect.stringContaining(
              "Check the selected Facebook Page",
            ),
          },
        },
      );

      expect(consoleError).toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("reports interruption even when persisting the error fails", async () => {
    const facebookAdapter = createMockFacebookAdapter();

    mocks.processPost.mockRejectedValue(
      new Error("Facebook publishing interrupted."),
    );

    mocks.postUpdateOne.mockRejectedValue(new Error("Database write failed."));

    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      await expect(
        publishImmediateFacebookPost(input, {
          enabled: true,
          adapter: facebookAdapter,
        }),
      ).rejects.toMatchObject({
        name: "FacebookImmediatePublishingError",
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

  it("records interruption when adapter factory construction fails", async () => {
    const facebookAdapter = createMockFacebookAdapter();

    mocks.createPublishingAdapter.mockImplementation(() => {
      throw new Error("Publishing adapter configuration failed.");
    });

    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      await expect(
        publishImmediateFacebookPost(input, {
          enabled: true,
          adapter: facebookAdapter,
        }),
      ).rejects.toMatchObject({
        name: "FacebookImmediatePublishingError",
        statusCode: 500,
        message: expect.stringContaining("outcome may be unknown"),
      });

      expect(mocks.claimImmediateFacebookPost).toHaveBeenCalledOnce();

      expect(mocks.createPublishingAdapter).toHaveBeenCalledOnce();

      expect(mocks.orchestratorConstructor).not.toHaveBeenCalled();

      expect(mocks.processPost).not.toHaveBeenCalled();

      expect(mocks.postUpdateOne).toHaveBeenCalledOnce();
    } finally {
      consoleError.mockRestore();
    }
  });
});
