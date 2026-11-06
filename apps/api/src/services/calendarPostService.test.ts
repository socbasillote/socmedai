import { afterEach, describe, expect, it, vi } from "vitest";

import Post from "../models/Post.js";

import {
  CalendarPostServiceError,
  findAuthorizedCalendarPosts,
} from "./calendarPostService.js";

const workspaceId = "507f1f77bcf86cd799439011";

const range = {
  start: "2026-11-01T00:00:00.000Z",
  end: "2026-12-01T00:00:00.000Z",
};

function mockPostFind(posts: unknown[]) {
  const lean = vi.fn().mockResolvedValue(posts);
  const limit = vi.fn().mockReturnValue({ lean });
  const sort = vi.fn().mockReturnValue({ limit });
  const select = vi.fn().mockReturnValue({ sort });

  const find = vi.spyOn(Post, "find").mockReturnValue({ select } as never);

  return {
    find,
    select,
    sort,
    limit,
    lean,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("findAuthorizedCalendarPosts", () => {
  it("filters by the authorized workspace", async () => {
    const mock = mockPostFind([]);

    await findAuthorizedCalendarPosts(workspaceId, range);

    expect(mock.find).toHaveBeenCalledOnce();

    const filter = mock.find.mock.calls[0]?.[0];

    expect(filter).toMatchObject({
      workspaceId,
    });
  });

  it("uses start-inclusive and end-exclusive dates", async () => {
    const mock = mockPostFind([]);

    await findAuthorizedCalendarPosts(workspaceId, range);

    const filter = mock.find.mock.calls[0]?.[0];

    expect(filter).toMatchObject({
      $or: [
        {
          status: {
            $in: ["scheduled", "publishing", "failed"],
          },
          scheduledAt: {
            $gte: new Date(range.start),
            $lt: new Date(range.end),
          },
        },
        {
          status: "published",
          publishedAt: {
            $gte: new Date(range.start),
            $lt: new Date(range.end),
          },
        },
      ],
    });
  });

  it("does not query drafts without scheduled dates", async () => {
    const mock = mockPostFind([]);

    await findAuthorizedCalendarPosts(workspaceId, range);

    const filter = mock.find.mock.calls[0]?.[0];

    expect(JSON.stringify(filter)).not.toContain('"draft"');
  });

  it("returns the requested range and matching posts", async () => {
    const posts = [
      {
        _id: "post-1",
        workspaceId,
        status: "scheduled",
        scheduledAt: new Date("2026-11-10T01:00:00.000Z"),
      },
    ];

    mockPostFind(posts);

    const result = await findAuthorizedCalendarPosts(workspaceId, range);

    expect(result.posts).toEqual(posts);
    expect(result.range).toEqual(range);
  });

  it("limits the database query to 1001 records", async () => {
    const mock = mockPostFind([]);

    await findAuthorizedCalendarPosts(workspaceId, range);

    expect(mock.limit).toHaveBeenCalledWith(1001);
  });

  it("allows exactly 1000 matching records", async () => {
    mockPostFind(
      Array.from({ length: 1000 }, (_, index) => ({
        _id: `post-${index}`,
      })),
    );

    const result = await findAuthorizedCalendarPosts(workspaceId, range);

    expect(result.posts).toHaveLength(1000);
  });

  it("rejects more than 1000 matching records", async () => {
    mockPostFind(
      Array.from({ length: 1001 }, (_, index) => ({
        _id: `post-${index}`,
      })),
    );

    await expect(
      findAuthorizedCalendarPosts(workspaceId, range),
    ).rejects.toMatchObject({
      name: "CalendarPostServiceError",
      statusCode: 422,
    });
  });

  it("defines a calendar-specific service error", () => {
    const error = new CalendarPostServiceError("Too many records", 422);

    expect(error).toBeInstanceOf(Error);
    expect(error.statusCode).toBe(422);
  });
});
