/* @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Post, PaginatedPostsResponse } from "@/lib/posts";

const mocks = vi.hoisted(() => ({
  getPostsPage: vi.fn(),
}));

vi.mock("@/lib/posts", () => ({
  getWorkspacePostsPage: mocks.getPostsPage,
}));

import { usePlannerPostList, type PlannerListMode } from "./usePlannerPostList";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function createPost(id: string, workspaceId = "workspace-a"): Post {
  return {
    _id: id,
    workspaceId,
    createdByUserId: "user-1",
    title: id,
    caption: "Test post",
    mediaIds: [],
    platforms: ["facebook"],
    status: "scheduled",
    scheduledAt: "2026-11-12T01:00:00.000Z",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  };
}

function page(
  posts: Post[],
  nextCursor: string | null = null,
): PaginatedPostsResponse {
  return {
    posts,
    nextCursor,
    hasMore: nextCursor !== null,
    draftCount: 0,
  };
}

beforeEach(() => {
  mocks.getPostsPage.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("usePlannerPostList", () => {
  it("requests scheduled posts with the scheduled filter", async () => {
    mocks.getPostsPage.mockResolvedValue(page([createPost("post-1")]));

    const { result } = renderHook(() =>
      usePlannerPostList("workspace-a", "scheduled"),
    );

    await waitFor(() => {
      expect(result.current.posts).toHaveLength(1);
    });

    expect(mocks.getPostsPage).toHaveBeenCalledWith("workspace-a", {
      limit: 20,
      status: "scheduled",
    });
  });

  it("requests all statuses when mode is all", async () => {
    mocks.getPostsPage.mockResolvedValue(
      page([
        {
          ...createPost("draft-1"),
          status: "draft",
          scheduledAt: undefined,
        },
        createPost("scheduled-1"),
      ]),
    );

    const { result } = renderHook(() =>
      usePlannerPostList("workspace-a", "all"),
    );

    await waitFor(() => {
      expect(result.current.posts).toHaveLength(2);
    });

    expect(mocks.getPostsPage).toHaveBeenCalledWith("workspace-a", {
      limit: 20,
      status: "all",
    });
  });

  it("does not expose an older workspace response", async () => {
    const oldRequest = deferred<PaginatedPostsResponse>();

    const newRequest = deferred<PaginatedPostsResponse>();

    mocks.getPostsPage
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise);

    const { result, rerender } = renderHook(
      ({ workspaceId }) => usePlannerPostList(workspaceId, "scheduled"),
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
      newRequest.resolve(page([createPost("post-b", "workspace-b")]));
    });

    await waitFor(() => {
      expect(result.current.posts.map((post) => post._id)).toEqual(["post-b"]);
    });

    await act(async () => {
      oldRequest.resolve(page([createPost("post-a", "workspace-a")]));
    });

    expect(result.current.posts.map((post) => post._id)).toEqual(["post-b"]);
  });

  it("does not mix scheduled and all posts", async () => {
    const scheduledRequest = deferred<PaginatedPostsResponse>();

    const allRequest = deferred<PaginatedPostsResponse>();

    mocks.getPostsPage
      .mockReturnValueOnce(scheduledRequest.promise)
      .mockReturnValueOnce(allRequest.promise);

    const { result, rerender } = renderHook(
      ({ mode }: { mode: PlannerListMode }) =>
        usePlannerPostList("workspace-a", mode),
      {
        initialProps: {
          mode: "scheduled" as PlannerListMode,
        },
      },
    );

    rerender({ mode: "all" });

    await act(async () => {
      allRequest.resolve(page([createPost("all-post")]));
    });

    await waitFor(() => {
      expect(result.current.posts.map((post) => post._id)).toEqual([
        "all-post",
      ]);
    });

    await act(async () => {
      scheduledRequest.resolve(page([createPost("scheduled-post")]));
    });

    expect(result.current.posts.map((post) => post._id)).toEqual(["all-post"]);
  });

  it("appends pages without duplicate IDs", async () => {
    mocks.getPostsPage
      .mockResolvedValueOnce(
        page([createPost("post-1"), createPost("post-2")], "cursor-1"),
      )
      .mockResolvedValueOnce(
        page([createPost("post-2"), createPost("post-3")]),
      );

    const { result } = renderHook(() =>
      usePlannerPostList("workspace-a", "scheduled"),
    );

    await waitFor(() => {
      expect(result.current.hasMore).toBe(true);
    });

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.posts.map((post) => post._id)).toEqual([
      "post-1",
      "post-2",
      "post-3",
    ]);
  });

  it("preserves posts when Load More fails", async () => {
    mocks.getPostsPage
      .mockResolvedValueOnce(page([createPost("post-1")], "cursor-1"))
      .mockRejectedValueOnce(new Error("Network unavailable"));

    const { result } = renderHook(() =>
      usePlannerPostList("workspace-a", "scheduled"),
    );

    await waitFor(() => {
      expect(result.current.hasMore).toBe(true);
    });

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.posts.map((post) => post._id)).toEqual(["post-1"]);

    expect(result.current.error).toBe("Network unavailable");

    expect(result.current.hasMore).toBe(true);
  });

  it("ignores an old Load More response after refresh", async () => {
    const oldLoadMore = deferred<PaginatedPostsResponse>();

    mocks.getPostsPage
      .mockResolvedValueOnce(page([createPost("old-first")], "cursor-1"))
      .mockReturnValueOnce(oldLoadMore.promise)
      .mockResolvedValueOnce(page([createPost("fresh-first")]));

    const { result } = renderHook(() =>
      usePlannerPostList("workspace-a", "scheduled"),
    );

    await waitFor(() => {
      expect(result.current.hasMore).toBe(true);
    });

    let pendingLoad: Promise<void>;

    act(() => {
      pendingLoad = result.current.loadMore();
    });

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.posts.map((post) => post._id)).toEqual([
        "fresh-first",
      ]);
    });

    await act(async () => {
      oldLoadMore.resolve(page([createPost("stale-second")]));

      await pendingLoad;
    });

    expect(result.current.posts.map((post) => post._id)).toEqual([
      "fresh-first",
    ]);
  });
});
