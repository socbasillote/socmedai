import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/lib/posts", () => ({ getWorkspacePostsPage: vi.fn() }));
import { getWorkspacePostsPage } from "@/lib/posts";
import { usePostPagination } from "./usePostPagination";
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it("aborts a pending page on search changes and never appends stale results", async () => {
  let resolve!: (value: Awaited<ReturnType<typeof getWorkspacePostsPage>>) => void;
  vi.mocked(getWorkspacePostsPage).mockReturnValue(new Promise((done) => { resolve = done; }));
  const setSavedPosts = vi.fn();
  const options = { selectedWorkspaceId: "workspace", nextPostsCursor: "cursor", search: "old", statusFilter: "all" as const, platformFilter: "all" as const,
    setSavedPosts, setNextPostsCursor: vi.fn(), setHasMorePosts: vi.fn(), setDraftCount: vi.fn(), setPostsLoadError: vi.fn() };
  const view = renderHook(({ search }) => usePostPagination({ ...options, search }), { initialProps: { search: "old" } });
  let request!: Promise<void>;
  act(() => { request = view.result.current.handleLoadMorePosts(); });
  const signal = vi.mocked(getWorkspacePostsPage).mock.calls[0][1]?.signal;
  view.rerender({ search: "new" });
  expect(signal?.aborted).toBe(true);
  await act(async () => { resolve({ posts: [], draftCount: 0, hasMore: false, nextCursor: null }); await request; });
  expect(setSavedPosts).not.toHaveBeenCalled();
});
