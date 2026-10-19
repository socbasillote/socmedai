import { beforeEach, describe, expect, it, vi } from "vitest";

const { findByIdMock, findOneAndUpdateMock } = vi.hoisted(() => ({
  findByIdMock: vi.fn(),
  findOneAndUpdateMock: vi.fn(),
}));

vi.mock("../../models/Post.js", () => ({
  default: {
    findById: findByIdMock,
    findOneAndUpdate: findOneAndUpdateMock,
  },
}));

import {
  PostStatusReconciliationError,
  reconcilePostStatus,
} from "./postStatusReconciliationService.js";

const postId = "507f1f77bcf86cd799439011";

function setupPost(overrides: Record<string, unknown> = {}) {
  const post = {
    _id: postId,
    status: "publishing",
    platforms: ["facebook", "instagram"],
    platformResults: [
      {
        platform: "facebook",
        status: "published",
        publishedAt: new Date("2026-10-19T01:00:00.000Z"),
      },
      {
        platform: "instagram",
        status: "published",
        publishedAt: new Date("2026-10-19T02:00:00.000Z"),
      },
    ],
    ...overrides,
  };

  findByIdMock.mockReturnValue({
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(post),
    }),
  });

  findOneAndUpdateMock.mockResolvedValue({
    ...post,
    status: "published",
    publishedAt: new Date("2026-10-19T02:00:00.000Z"),
  });

  return post;
}

describe("reconcilePostStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks the post published when every selected platform is published", async () => {
    setupPost();

    await reconcilePostStatus(postId);

    expect(findOneAndUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "publishing",
        platforms: ["facebook", "instagram"],
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "published",
          publishedAt: new Date("2026-10-19T02:00:00.000Z"),
        }),
      }),
      expect.objectContaining({ runValidators: true }),
    );
  });

  it("does not mark a post published while a platform outcome is unknown", async () => {
    setupPost({
      platformResults: [
        {
          platform: "facebook",
          status: "published",
          publishedAt: new Date("2026-10-19T01:00:00.000Z"),
        },
        { platform: "instagram", status: "unknown" },
      ],
    });

    await reconcilePostStatus(postId);

    expect(findOneAndUpdateMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        $set: { status: "publishing" },
        $unset: { publishedAt: "" },
      }),
      expect.any(Object),
    );
  });

  it("treats a missing selected-platform result as pending", async () => {
    setupPost({
      platformResults: [
        {
          platform: "facebook",
          status: "published",
          publishedAt: new Date("2026-10-19T01:00:00.000Z"),
        },
      ],
    });

    await reconcilePostStatus(postId);

    expect(findOneAndUpdateMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        $set: { status: "publishing" },
      }),
      expect.any(Object),
    );
  });

  it("preserves the existing status for simulated results", async () => {
    setupPost({
      status: "scheduled",
      platformResults: [
        { platform: "facebook", status: "simulated" },
        { platform: "instagram", status: "simulated" },
      ],
    });

    await reconcilePostStatus(postId);

    expect(findOneAndUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "scheduled" }),
      expect.objectContaining({
        $set: { status: "scheduled" },
        $unset: { publishedAt: "" },
      }),
      expect.any(Object),
    );
  });

  it("returns 404 when the post does not exist", async () => {
    findByIdMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      }),
    });

    await expect(reconcilePostStatus(postId)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(findOneAndUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 409 when the post changes during reconciliation", async () => {
    setupPost();
    findOneAndUpdateMock.mockResolvedValue(null);

    await expect(reconcilePostStatus(postId)).rejects.toBeInstanceOf(
      PostStatusReconciliationError,
    );
    await expect(reconcilePostStatus(postId)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("rejects invalid post IDs", async () => {
    await expect(reconcilePostStatus("not-an-object-id")).rejects.toMatchObject(
      {
        statusCode: 404,
      },
    );
    expect(findByIdMock).not.toHaveBeenCalled();
  });
});
