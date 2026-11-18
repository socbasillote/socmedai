import { act, cleanup, renderHook } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("@/lib/posts", () => ({ getWorkspacePostsPage: vi.fn() }));
import { getWorkspacePostsPage } from "@/lib/posts";
import { usePosts } from "./usePosts";
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.mocked(getWorkspacePostsPage).mockResolvedValue({ posts: [], draftCount: 0, nextCursor: null, hasMore: false }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("makes no post request for inactive views", async () => {
  renderHook(() => usePosts("workspace", "", "all", "all", false));
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  expect(getWorkspacePostsPage).not.toHaveBeenCalled();
});
it("debounces typing and aborts the superseded request", async () => {
  const { rerender, unmount } = renderHook(({ search }) => usePosts("workspace", search, "all", "all"), { initialProps: { search: "" } });
  await act(async () => { await Promise.resolve(); });
  const firstSignal = vi.mocked(getWorkspacePostsPage).mock.calls[0][1]?.signal;
  rerender({ search: "c" }); rerender({ search: "co" }); rerender({ search: "coffee" });
  expect(firstSignal?.aborted).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(299); });
  expect(getWorkspacePostsPage).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(getWorkspacePostsPage).toHaveBeenCalledTimes(2);
  expect(vi.mocked(getWorkspacePostsPage).mock.calls[1][1]?.search).toBe("coffee");
  const lastSignal = vi.mocked(getWorkspacePostsPage).mock.calls[1][1]?.signal;
  unmount(); expect(lastSignal?.aborted).toBe(true);
});
