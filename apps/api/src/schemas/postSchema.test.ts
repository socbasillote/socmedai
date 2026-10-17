import { describe, expect, it } from "vitest";

import {
  createPostSchema,
  updateDraftPostSchema,
  listWorkspacePostsQuerySchema,
} from "./postSchema.js";

const validPost = {
  workspaceId: "507f1f77bcf86cd799439011",
  caption: "A post for our upcoming campaign.",
  platforms: ["facebook", "instagram"],
};

describe("createPostSchema", () => {
  it("accepts valid post data", () => {
    const result = createPostSchema.safeParse(validPost);

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.mediaIds).toEqual([]);
      expect(result.data.caption).toBe("A post for our upcoming campaign.");
    }
  });

  it("rejects a caption containing only whitespace", () => {
    const result = createPostSchema.safeParse({
      ...validPost,
      caption: "   ",
    });

    expect(result.success).toBe(false);
  });

  it("rejects unsupported publishing platforms", () => {
    const result = createPostSchema.safeParse({
      ...validPost,
      platforms: ["facebook", "tiktok"],
    });

    expect(result.success).toBe(false);
  });

  it("rejects duplicate publishing platforms", () => {
    const result = createPostSchema.safeParse({
      ...validPost,
      platforms: ["facebook", "facebook"],
    });

    expect(result.success).toBe(false);
  });

  it("rejects a missing publishing platform", () => {
    const result = createPostSchema.safeParse({
      ...validPost,
      platforms: [],
    });

    expect(result.success).toBe(false);
  });

  it("rejects malformed workspace and media IDs", () => {
    const invalidWorkspace = createPostSchema.safeParse({
      ...validPost,
      workspaceId: "not-an-object-id",
    });

    const invalidMedia = createPostSchema.safeParse({
      ...validPost,
      mediaIds: ["invalid-media-id"],
    });

    expect(invalidWorkspace.success).toBe(false);
    expect(invalidMedia.success).toBe(false);
  });

  it("accepts a future scheduled time", () => {
    const result = createPostSchema.safeParse({
      ...validPost,
      scheduledAt: "2099-01-01T00:00:00.000Z",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a scheduled time in the past", () => {
    const result = createPostSchema.safeParse({
      ...validPost,
      scheduledAt: "2000-01-01T00:00:00.000Z",
    });

    expect(result.success).toBe(false);
  });

  it("rejects more than 20 media items", () => {
    const result = createPostSchema.safeParse({
      ...validPost,
      mediaIds: Array.from({ length: 21 }, () => "507f1f77bcf86cd799439011"),
    });

    expect(result.success).toBe(false);
  });
});

describe("updateDraftPostSchema", () => {
  it("accepts a caption-only update", () => {
    const result = updateDraftPostSchema.safeParse({
      caption: "Updated campaign caption",
    });

    expect(result.success).toBe(true);
  });

  it("accepts valid title and platform updates", () => {
    const result = updateDraftPostSchema.safeParse({
      title: "  Summer Campaign  ",
      platforms: ["facebook", "linkedin"],
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.title).toBe("Summer Campaign");
      expect(result.data.platforms).toEqual(["facebook", "linkedin"]);
    }
  });

  it("rejects an empty update", () => {
    const result = updateDraftPostSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("rejects a blank caption", () => {
    const result = updateDraftPostSchema.safeParse({
      caption: "   ",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an unsupported platform", () => {
    const result = updateDraftPostSchema.safeParse({
      platforms: ["tiktok"],
    });

    expect(result.success).toBe(false);
  });

  it("rejects duplicate platforms", () => {
    const result = updateDraftPostSchema.safeParse({
      platforms: ["facebook", "facebook"],
    });

    expect(result.success).toBe(false);
  });

  it("rejects attempts to update protected fields", () => {
    const result = updateDraftPostSchema.safeParse({
      caption: "Updated caption",
      status: "published",
      workspaceId: "507f1f77bcf86cd799439011",
    });

    expect(result.success).toBe(false);
  });

  it("allows clearing an optional title", () => {
    const result = updateDraftPostSchema.safeParse({
      title: "",
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.title).toBe("");
    }
  });
});

describe("listWorkspacePostsQuerySchema", () => {
  it("defaults the limit to 20", () => {
    expect(listWorkspacePostsQuerySchema.parse({})).toEqual({
      limit: 20,
      search: "",
      status: "all",
      platform: "all",
    });
  });

  it("accepts a valid limit and ObjectId cursor", () => {
    expect(
      listWorkspacePostsQuerySchema.parse({
        limit: "10",
        cursor: "507f1f77bcf86cd799439011",
      }),
    ).toEqual({
      limit: 10,
      cursor: "507f1f77bcf86cd799439011",
      search: "",
      status: "all",
      platform: "all",
    });
  });

  it("rejects a limit below 1", () => {
    expect(
      listWorkspacePostsQuerySchema.safeParse({ limit: "0" }).success,
    ).toBe(false);
  });

  it("rejects a limit above 100", () => {
    expect(
      listWorkspacePostsQuerySchema.safeParse({ limit: "101" }).success,
    ).toBe(false);
  });

  it("rejects a fractional limit", () => {
    expect(
      listWorkspacePostsQuerySchema.safeParse({ limit: "1.5" }).success,
    ).toBe(false);
  });

  it("rejects an invalid cursor", () => {
    expect(
      listWorkspacePostsQuerySchema.safeParse({
        cursor: "not-a-valid-object-id",
      }).success,
    ).toBe(false);
  });
});
