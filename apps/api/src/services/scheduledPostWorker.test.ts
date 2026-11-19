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

    const [filter, update, options] = mocks.postFindOneAndUpdate.mock.calls[0];
    expect(filter).toMatchObject({ status: "scheduled", scheduledAt: { $lte: now } });
    expect(filter.$and).toHaveLength(2);
    expect(filter.$and[1].$or).toEqual(expect.arrayContaining([
      expect.objectContaining({ platforms: ["instagram"], mediaIds: { $size: 1 } }),
      expect.objectContaining({ platforms: ["facebook"], mediaIds: { $size: 0 } }),
      expect.objectContaining({ platforms: ["linkedin"], mediaIds: { $size: 0 } }),
    ]));
    expect(update.$set).toMatchObject({ status: "publishing", claimedAt: now, scheduledClaimId: expect.any(String), scheduledLeaseExpiresAt: new Date(now.getTime() + 900000) });
    expect(options.sort).toEqual({ scheduledAt: 1, _id: 1 });
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
        $or: [ { scheduledClaimId: { $type: "string", $ne: "" }, scheduledLeaseExpiresAt: { $type: "date", $lte: now } }, { scheduledClaimId: null, claimedAt: { $ne: null, $lte: staleBefore } } ],
      },
      {
        $set: {
          status: "unknown",
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
