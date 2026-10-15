import { describe, expect, it } from "vitest";

import { createPostSchema } from "./postSchema.js";

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
