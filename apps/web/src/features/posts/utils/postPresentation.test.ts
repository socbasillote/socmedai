import { describe, expect, it } from "vitest";

import type { Post } from "@/lib/posts";

import { toRecentPostItem, toRecentPostItems } from "./postPresentation";

const createdAt = "2026-11-01T08:00:00.000Z";
const scheduledAt = "2026-11-10T01:00:00.000Z";

/**
 * Minimal test fixture.
 *
 * Only fields consumed by postPresentation are
 * relevant here. The cast avoids unrelated API
 * model requirements in this unit test.
 */
function createPost(overrides: Partial<Post> = {}): Post {
  return {
    _id: "post-1",
    title: "Campaign launch",
    caption: "Our campaign starts soon.",
    platforms: ["facebook"],
    status: "draft",
    createdAt,
    ...overrides,
  } as Post;
}

describe("postPresentation", () => {
  it("maps a draft post", () => {
    const post = createPost();

    const result = toRecentPostItem(post);

    expect(result.id).toBe("post-1");
    expect(result.title).toBe("Campaign launch");
    expect(result.platform).toBe("facebook");
    expect(result.status).toBe("Draft");
    expect(result.initials).toBe("DR");
    expect(result.color).toBe("bg-violet-100 text-violet-700");
    expect(result.date).toBe(new Date(createdAt).toLocaleString());
  });

  it("uses the caption when the title is empty", () => {
    const post = createPost({
      title: "",
      caption: "Caption fallback",
    });

    expect(toRecentPostItem(post).title).toBe("Caption fallback");
  });

  it("displays the scheduled date for scheduled posts", () => {
    const post = createPost({
      status: "scheduled",
      scheduledAt,
    });

    const result = toRecentPostItem(post);

    expect(result.date).toBe(new Date(scheduledAt).toLocaleString());

    expect(result.status).toBe("Scheduled");
    expect(result.color).toBe("bg-blue-100 text-blue-700");
  });

  it("joins multiple platforms", () => {
    const post = createPost({
      platforms: ["facebook", "linkedin"],
    });

    expect(toRecentPostItem(post).platform).toBe("facebook, linkedin");
  });

  it("preserves the missing-date fallback", () => {
    const post = createPost({
      createdAt: undefined,
    });

    expect(toRecentPostItem(post).date).toBe("Date unavailable");
  });

  it("preserves the original input objects", () => {
    const first = createPost();
    const second = createPost({
      _id: "post-2",
      status: "published",
    });

    const posts = [first, second];
    const original = structuredClone(posts);

    const result = toRecentPostItems(posts);

    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe("post-1");
    expect(result[1]?.id).toBe("post-2");
    expect(posts).toEqual(original);
  });

  it("handles an empty post collection", () => {
    expect(toRecentPostItems([])).toEqual([]);
  });
});
