import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  postFindOneAndUpdate: vi.fn(),
  postUpdateMany: vi.fn(),
}));

vi.mock("../models/Post.js", () => ({
  default: {
    findOneAndUpdate: mocks.postFindOneAndUpdate,
    updateMany: mocks.postUpdateMany,
  },
}));

import {
  claimNextDuePost,
  recoverStalePublishingPosts,
} from "./scheduledPostWorker.js";

describe("scheduledPostWorker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("claims the earliest due scheduled post atomically", async () => {
    const now = new Date("2026-10-17T10:00:00.000Z");
    const claimedPost = {
      _id: "507f1f77bcf86cd799439013",
      status: "publishing",
      scheduledAt: new Date("2026-10-17T09:00:00.000Z"),
    };

    const lean = vi.fn().mockResolvedValue(claimedPost);
    const select = vi.fn().mockReturnValue({ lean });

    mocks.postFindOneAndUpdate.mockReturnValue({ select });

    const result = await claimNextDuePost(now);

    expect(mocks.postFindOneAndUpdate).toHaveBeenCalledWith(
      {
        status: "scheduled",
        scheduledAt: { $lte: now },
      },
      {
        $set: {
          status: "publishing",
          claimedAt: now,
        },
        $inc: {
          attemptCount: 1,
        },
      },
      {
        new: true,
        sort: { scheduledAt: 1, _id: 1 },
        runValidators: true,
      },
    );

    expect(select).toHaveBeenCalledWith(
      "_id workspaceId createdByUserId title caption mediaIds platforms status scheduledAt publishedAt claimedAt attemptCount lastError createdAt updatedAt",
    );
    expect(result).toEqual(claimedPost);
  });

  it("returns null when no due post is available", async () => {
    const lean = vi.fn().mockResolvedValue(null);
    const select = vi.fn().mockReturnValue({ lean });

    mocks.postFindOneAndUpdate.mockReturnValue({ select });

    const result = await claimNextDuePost(new Date("2026-10-17T10:00:00.000Z"));

    expect(result).toBeNull();
  });

  it("marks only stale publishing claims as failed", async () => {
    const now = new Date("2026-10-18T10:00:00.000Z");
    const timeoutMs = 15 * 60 * 1000;
    const staleBefore = new Date(now.getTime() - timeoutMs);

    const updateResult = { acknowledged: true, modifiedCount: 2 };
    mocks.postUpdateMany.mockResolvedValue(updateResult);

    const result = await recoverStalePublishingPosts(now, timeoutMs);

    expect(mocks.postUpdateMany).toHaveBeenCalledWith(
      {
        status: "publishing",
        claimedAt: { $ne: null, $lte: staleBefore },
      },
      {
        $set: {
          status: "failed",
          lastError:
            "Publishing claim expired before completion. Automatic retry was withheld because the publishing outcome is unknown.",
        },
      },
      { runValidators: true },
    );
    expect(result).toEqual(updateResult);
  });

  it("rejects a zero or negative stale claim timeout", async () => {
    await expect(recoverStalePublishingPosts(new Date(), 0)).rejects.toThrow(
      "Stale claim timeout must be a positive number.",
    );

    await expect(recoverStalePublishingPosts(new Date(), -1)).rejects.toThrow(
      "Stale claim timeout must be a positive number.",
    );

    expect(mocks.postUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects a non-finite stale claim timeout", async () => {
    await expect(
      recoverStalePublishingPosts(new Date(), Number.NaN),
    ).rejects.toThrow("Stale claim timeout must be a positive number.");

    expect(mocks.postUpdateMany).not.toHaveBeenCalled();
  });
});
