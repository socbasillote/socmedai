import { beforeEach, describe, expect, it, vi } from "vitest";

const { findOneAndUpdateMock, existsMock } = vi.hoisted(() => ({
  findOneAndUpdateMock: vi.fn(),
  existsMock: vi.fn(),
}));

vi.mock("../../models/Post.js", () => ({
  default: {
    findOneAndUpdate: findOneAndUpdateMock,
    exists: existsMock,
  },
  POST_PLATFORMS: ["facebook", "instagram", "linkedin"],
  PLATFORM_PUBLISH_STATUSES: [
    "pending",
    "publishing",
    "published",
    "failed",
    "unknown",
    "simulated",
  ],
}));

import {
  initializePlatformResults,
  PlatformResultServiceError,
  updatePlatformResult,
} from "./platformResultService.js";

describe("updatePlatformResult", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsMock.mockReset();
  });

  it("updates the selected platform atomically", async () => {
    const post = {
      platformResults: [{ platform: "facebook", status: "published" }],
    };
    findOneAndUpdateMock.mockResolvedValue(post);

    const result = await updatePlatformResult("post-123", {
      platform: "facebook",
      status: "published",
      externalPostId: "external-123",
      publishedAt: new Date("2026-10-19T00:00:00.000Z"),
      attemptCount: 1,
    });

    expect(result).toBe(post);
    expect(findOneAndUpdateMock).toHaveBeenCalledWith(
      {
        _id: "post-123",
        platformResults: {
          $elemMatch: {
            platform: "facebook",
            status: { $in: ["publishing", "unknown"] },
          },
        },
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          "platformResults.$[result].status": "published",
          "platformResults.$[result].externalPostId": "external-123",
          "platformResults.$[result].publishedAt": new Date(
            "2026-10-19T00:00:00.000Z",
          ),
          "platformResults.$[result].attemptCount": 1,
        }),
      }),
      expect.objectContaining({
        returnDocument: "after",
        runValidators: true,
        arrayFilters: [
          {
            "result.platform": "facebook",
            "result.status": {
              $in: ["publishing", "unknown"],
            },
          },
        ],
      }),
    );
  });

  it("persists a simulated outcome without publication metadata", async () => {
    const post = {
      platformResults: [{ platform: "facebook", status: "simulated" }],
    };
    findOneAndUpdateMock.mockResolvedValue(post);

    const result = await updatePlatformResult("post-123", {
      platform: "facebook",
      status: "simulated",
      lastError: "Dry run completed; no real publication was attempted.",
      attemptCount: 1,
    });

    expect(result).toBe(post);
    expect(findOneAndUpdateMock).toHaveBeenCalledWith(
      {
        _id: "post-123",
        platformResults: {
          $elemMatch: {
            platform: "facebook",
            status: { $in: ["publishing"] },
          },
        },
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          "platformResults.$[result].status": "simulated",
          "platformResults.$[result].lastError":
            "Dry run completed; no real publication was attempted.",
          "platformResults.$[result].attemptCount": 1,
        }),
      }),
      expect.objectContaining({
        returnDocument: "after",
        runValidators: true,
        arrayFilters: [
          {
            "result.platform": "facebook",
            "result.status": { $in: ["publishing"] },
          },
        ],
      }),
    );
  });

  it("rejects publication without external confirmation details", async () => {
    await expect(
      updatePlatformResult("post-123", {
        platform: "facebook",
        status: "published",
      }),
    ).rejects.toThrow(
      "Confirmed publication requires an external post ID and a valid publication timestamp.",
    );

    expect(findOneAndUpdateMock).not.toHaveBeenCalled();
  });

  it("rejects a negative attempt count", async () => {
    await expect(
      updatePlatformResult("post-123", {
        platform: "facebook",
        status: "pending",
        attemptCount: -1,
      }),
    ).rejects.toThrow("Attempt count must be a non-negative integer.");

    expect(findOneAndUpdateMock).not.toHaveBeenCalled();
  });

  it("returns not found when the post does not exist", async () => {
    findOneAndUpdateMock.mockResolvedValue(null);
    existsMock.mockResolvedValue(null);

    await expect(
      updatePlatformResult("missing-post", {
        platform: "facebook",
        status: "pending",
      }),
    ).rejects.toMatchObject({
      name: "PlatformResultServiceError",
      statusCode: 404,
    });
  });

  it("rejects updates when the platform result is not initialized", async () => {
    findOneAndUpdateMock.mockResolvedValue(null);
    existsMock
      .mockResolvedValueOnce({ _id: "post-123" })
      .mockResolvedValueOnce(null);

    await expect(
      updatePlatformResult("post-123", {
        platform: "facebook",
        status: "pending",
      }),
    ).rejects.toMatchObject({
      name: "PlatformResultServiceError",
      statusCode: 409,
    });
  });
});

describe("initializePlatformResults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsMock.mockReset();
  });

  it("adds results for the requested platforms using an update pipeline", async () => {
    const post = {
      platformResults: [
        { platform: "facebook", status: "pending" },
        { platform: "instagram", status: "pending" },
      ],
    };

    findOneAndUpdateMock.mockResolvedValue(post);

    const result = await initializePlatformResults("post-123", [
      "facebook",
      "instagram",
    ]);

    expect(result).toBe(post);
    expect(findOneAndUpdateMock).toHaveBeenCalledOnce();

    const [, pipeline, options] = findOneAndUpdateMock.mock.calls[0];

    expect(pipeline).toEqual([
      {
        $set: {
          platformResults: {
            $reduce: expect.objectContaining({
              input: [
                {
                  platform: "facebook",
                  status: "pending",
                  attemptCount: 0,
                },
                {
                  platform: "instagram",
                  status: "pending",
                  attemptCount: 0,
                },
              ],
            }),
          },
        },
      },
    ]);

    expect(options).toMatchObject({
      returnDocument: "after",
      updatePipeline: true,
    });

    expect(Array.isArray(pipeline)).toBe(true);
  });

  it("rejects duplicate platforms before accessing the database", async () => {
    await expect(
      initializePlatformResults("post-123", ["facebook", "facebook"]),
    ).rejects.toMatchObject({
      name: "PlatformResultServiceError",
      statusCode: 400,
    });

    expect(findOneAndUpdateMock).not.toHaveBeenCalled();
  });

  it("returns not found when the post does not exist", async () => {
    findOneAndUpdateMock.mockResolvedValue(null);

    await expect(
      initializePlatformResults("missing-post", ["facebook"]),
    ).rejects.toMatchObject({
      name: "PlatformResultServiceError",
      statusCode: 404,
    });
  });
});
