import { describe, expect, it } from "vitest";

import { createPostSchema, updateDraftPostSchema } from "./postSchema.js";

const WORKSPACE_ID = "507f1f77bcf86cd799439011";
const ASSET_A = "507f1f77bcf86cd799439012";
const ASSET_B = "507f1f77bcf86cd799439013";
const FACEBOOK_ID = "507f1f77bcf86cd799439014";

const basePost = {
  workspaceId: WORKSPACE_ID,
  caption: "New product announcement.",
  platforms: ["facebook"] as const,
};

describe("Post media attachment schemas", () => {
  it("accepts media IDs for draft creation", () => {
    const result = createPostSchema.safeParse({
      ...basePost,
      platforms: ["facebook"],
      mediaIds: [ASSET_A],
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.mediaIds).toEqual([ASSET_A]);
    }
  });

  it("defaults draft media to an empty array", () => {
    const result = createPostSchema.safeParse({
      ...basePost,
      platforms: ["facebook"],
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.mediaIds).toEqual([]);
    }
  });

  it("rejects scheduled posts containing media", () => {
    const result = createPostSchema.safeParse({
      ...basePost,
      platforms: ["facebook"],
      mediaIds: [ASSET_A],
      platformConnections: {
        facebook: FACEBOOK_ID,
      },
      scheduledAt: "2035-01-01T12:00:00.000Z",
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path.includes("mediaIds")),
      ).toBe(true);
    }
  });

  it("accepts media replacement in a draft update", () => {
    const result = updateDraftPostSchema.safeParse({
      mediaIds: [ASSET_A, ASSET_B],
    });

    expect(result.success).toBe(true);
  });

  it("accepts explicitly removing all attachments", () => {
    const result = updateDraftPostSchema.safeParse({
      mediaIds: [],
    });

    expect(result.success).toBe(true);
  });

  it("allows caption updates without media changes", () => {
    const result = updateDraftPostSchema.safeParse({
      caption: "Updated announcement.",
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.mediaIds).toBeUndefined();
    }
  });

  it("rejects duplicate IDs", () => {
    const result = updateDraftPostSchema.safeParse({
      mediaIds: [ASSET_A, ASSET_A],
    });

    expect(result.success).toBe(false);
  });

  it("rejects case-insensitive duplicate IDs", () => {
    const upperId = "ABCDEF77BCF86CD799439012";

    const result = updateDraftPostSchema.safeParse({
      mediaIds: [upperId, upperId.toLowerCase()],
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid media IDs", () => {
    const result = updateDraftPostSchema.safeParse({
      mediaIds: ["invalid-id"],
    });

    expect(result.success).toBe(false);
  });

  it("rejects more than 20 attachments", () => {
    const ids = Array.from(
      { length: 21 },
      (_, index) => `507f1f77bcf86cd79943${String(index).padStart(4, "0")}`,
    );

    const result = updateDraftPostSchema.safeParse({
      mediaIds: ids,
    });

    expect(result.success).toBe(false);
  });
});
