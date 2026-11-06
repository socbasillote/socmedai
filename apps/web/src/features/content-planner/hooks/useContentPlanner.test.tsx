/* @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Post } from "@/lib/posts";

const mocks = vi.hoisted(() => ({
  getCalendarPosts: vi.fn(),
}));

vi.mock("../api/calendarApi", () => ({
  getWorkspaceCalendarPosts: mocks.getCalendarPosts,
}));

import { useContentPlanner } from "./useContentPlanner";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function createPost(id: string, workspaceId: string): Post {
  return {
    _id: id,
    workspaceId,
    createdByUserId: "user-1",
    title: id,
    caption: "Calendar test post",
    mediaIds: [],
    platforms: ["facebook"],
    status: "scheduled",
    scheduledAt: "2026-12-10T01:00:00.000Z",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  };
}

type CalendarResponse = {
  posts: Post[];
  range: {
    start: string;
    end: string;
  };
};

function response(posts: Post[]): CalendarResponse {
  return {
    posts,
    range: {
      start: "2026-12-01T00:00:00.000Z",
      end: "2027-01-01T00:00:00.000Z",
    },
  };
}

beforeEach(() => {
  mocks.getCalendarPosts.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("useContentPlanner race protection", () => {
  it("ignores a response from the previous workspace", async () => {
    const oldRequest = deferred<CalendarResponse>();

    const newRequest = deferred<CalendarResponse>();

    mocks.getCalendarPosts
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise);

    const { result, rerender } = renderHook(
      ({ workspaceId }) =>
        useContentPlanner(workspaceId, {
          year: 2026,
          monthIndex: 11,
        }),
      {
        initialProps: {
          workspaceId: "workspace-a",
        },
      },
    );

    rerender({
      workspaceId: "workspace-b",
    });

    expect(result.current.posts).toEqual([]);

    await act(async () => {
      newRequest.resolve(response([createPost("post-b", "workspace-b")]));
    });

    await waitFor(() => {
      expect(result.current.posts.map((post) => post._id)).toEqual(["post-b"]);
    });

    await act(async () => {
      oldRequest.resolve(response([createPost("post-a", "workspace-a")]));
    });

    expect(result.current.posts.map((post) => post._id)).toEqual(["post-b"]);
  });

  it("ignores a response from an older month", async () => {
    const november = deferred<CalendarResponse>();

    const december = deferred<CalendarResponse>();

    mocks.getCalendarPosts
      .mockReturnValueOnce(november.promise)
      .mockReturnValueOnce(december.promise);

    const { result } = renderHook(() =>
      useContentPlanner("workspace-a", {
        year: 2026,
        monthIndex: 10,
      }),
    );

    act(() => {
      result.current.goToNextMonth();
    });

    expect(result.current.monthIndex).toBe(11);
    expect(result.current.posts).toEqual([]);

    await act(async () => {
      december.resolve(response([createPost("december-post", "workspace-a")]));
    });

    await waitFor(() => {
      expect(result.current.posts.map((post) => post._id)).toEqual([
        "december-post",
      ]);
    });

    await act(async () => {
      november.resolve(response([createPost("november-post", "workspace-a")]));
    });

    expect(result.current.posts.map((post) => post._id)).toEqual([
      "december-post",
    ]);
  });

  it("does not update state after unmounting", async () => {
    const pending = deferred<CalendarResponse>();

    mocks.getCalendarPosts.mockReturnValueOnce(pending.promise);

    const { unmount } = renderHook(() =>
      useContentPlanner("workspace-a", {
        year: 2026,
        monthIndex: 11,
      }),
    );

    unmount();

    await act(async () => {
      pending.resolve(response([createPost("late-post", "workspace-a")]));
    });

    expect(mocks.getCalendarPosts).toHaveBeenCalledOnce();
  });

  it("loads fresh data after refresh", async () => {
    mocks.getCalendarPosts
      .mockResolvedValueOnce(response([createPost("old-post", "workspace-a")]))
      .mockResolvedValueOnce(response([createPost("new-post", "workspace-a")]));

    const { result } = renderHook(() =>
      useContentPlanner("workspace-a", {
        year: 2026,
        monthIndex: 11,
      }),
    );

    await waitFor(() => {
      expect(result.current.posts).toHaveLength(1);
    });

    act(() => {
      result.current.refreshCalendar();
    });

    await waitFor(() => {
      expect(result.current.posts.map((post) => post._id)).toEqual([
        "new-post",
      ]);
    });

    expect(mocks.getCalendarPosts).toHaveBeenCalledTimes(2);
  });
});
