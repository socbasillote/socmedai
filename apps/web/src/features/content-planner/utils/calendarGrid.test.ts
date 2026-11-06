import { describe, expect, it } from "vitest";

import type { Post } from "@/lib/posts";

import {
  getCalendarMonthDays,
  getCalendarPostDate,
  groupCalendarPostsByDay,
  toLocalDateKey,
} from "./calendarGrid";

function createPost(overrides: Partial<Post> = {}): Post {
  return {
    _id: "post-1",
    workspaceId: "workspace-1",
    createdByUserId: "user-1",
    caption: "Test caption",
    title: "Test post",
    mediaIds: [],
    platforms: ["facebook"],
    status: "scheduled",
    scheduledAt: "2026-11-10T01:00:00.000Z",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("calendarGrid", () => {
  it("returns a six-week calendar grid", () => {
    const days = getCalendarMonthDays(2026, 10);

    expect(days).toHaveLength(42);
    expect(days[0]?.date.getDay()).toBe(0);
  });

  it("marks the current month correctly", () => {
    const days = getCalendarMonthDays(2026, 10);

    expect(days.filter((day) => day.inCurrentMonth)).toHaveLength(30);
  });

  it("uses scheduledAt for scheduled posts", () => {
    const post = createPost();

    expect(getCalendarPostDate(post)?.toISOString()).toBe(
      "2026-11-10T01:00:00.000Z",
    );
  });

  it("uses publishedAt for published posts", () => {
    const post = createPost({
      status: "published",
      publishedAt: "2026-11-12T01:00:00.000Z",
    });

    expect(getCalendarPostDate(post)?.toISOString()).toBe(
      "2026-11-12T01:00:00.000Z",
    );
  });

  it("excludes unscheduled drafts", () => {
    const post = createPost({
      status: "draft",
      scheduledAt: undefined,
    });

    expect(getCalendarPostDate(post)).toBeNull();
  });

  it("groups posts by the local date", () => {
    const post = createPost();
    const date = new Date(post.scheduledAt!);

    const key = toLocalDateKey(date);
    const groups = groupCalendarPostsByDay([post]);

    expect(groups.get(key)).toHaveLength(1);
  });

  it("sorts posts chronologically", () => {
    const earlier = createPost({
      _id: "earlier",
      scheduledAt: "2026-11-10T01:00:00.000Z",
    });

    const later = createPost({
      _id: "later",
      scheduledAt: "2026-11-10T05:00:00.000Z",
    });

    const key = toLocalDateKey(new Date(earlier.scheduledAt!));

    const groups = groupCalendarPostsByDay([later, earlier]);

    expect(groups.get(key)?.map((post) => post._id)).toEqual([
      "earlier",
      "later",
    ]);
  });
});
