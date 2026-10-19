import { describe, expect, it } from "vitest";
import Post, { PLATFORM_PUBLISH_STATUSES, POST_PLATFORMS } from "./Post.js";

describe("Post platformResults schema", () => {
  it("defaults platformResults to an empty array", () => {
    const post = new Post({
      workspaceId: "507f1f77bcf86cd799439011",
      createdByUserId: "507f1f77bcf86cd799439012",
      caption: "Test post",
      platforms: ["facebook"],
    });

    expect(post.platformResults).toEqual([]);
  });

  it("accepts a valid platform result", async () => {
    const post = new Post({
      workspaceId: "507f1f77bcf86cd799439011",
      createdByUserId: "507f1f77bcf86cd799439012",
      caption: "Test post",
      platforms: ["facebook"],
      platformResults: [
        {
          platform: "facebook",
          status: "published",
          externalPostId: "external-123",
          publishedAt: new Date(),
          attemptCount: 1,
        },
      ],
    });

    await expect(post.validate()).resolves.toBeUndefined();
  });

  it("rejects an unsupported platform status", async () => {
    const post = new Post({
      workspaceId: "507f1f77bcf86cd799439011",
      createdByUserId: "507f1f77bcf86cd799439012",
      caption: "Test post",
      platforms: ["facebook"],
      platformResults: [
        {
          platform: "facebook",
          status: "completed",
          attemptCount: 0,
        },
      ],
    });

    await expect(post.validate()).rejects.toThrow();
  });

  it("rejects duplicate results for the same platform", async () => {
    const post = new Post({
      workspaceId: "507f1f77bcf86cd799439011",
      createdByUserId: "507f1f77bcf86cd799439012",
      caption: "Test post",
      platforms: ["facebook"],
      platformResults: [
        { platform: "facebook", status: "pending", attemptCount: 0 },
        { platform: "facebook", status: "failed", attemptCount: 1 },
      ],
    });

    await expect(post.validate()).rejects.toThrow(
      "Each platform can have only one publishing result.",
    );
  });

  it("keeps platform statuses and names aligned with supported values", () => {
    expect(PLATFORM_PUBLISH_STATUSES).toEqual([
      "pending",
      "publishing",
      "published",
      "failed",
      "unknown",
      "simulated",
    ]);

    expect(POST_PLATFORMS).toEqual(["facebook", "instagram", "linkedin"]);
  });
});
