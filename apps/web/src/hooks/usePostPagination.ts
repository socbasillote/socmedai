import { useLayoutEffect, useRef, useState } from "react";
import { getWorkspacePostsPage, type Post } from "@/lib/posts";

type PostStatusFilter = "all" | "draft" | "scheduled" | "published" | "failed";
type PostPlatformFilter = "all" | "facebook" | "instagram" | "linkedin";

type UsePostPaginationOptions = {
  selectedWorkspaceId: string;
  nextPostsCursor: string | null;
  search: string;
  statusFilter: PostStatusFilter;
  platformFilter: PostPlatformFilter;
  setSavedPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  setNextPostsCursor: (cursor: string | null) => void;
  setHasMorePosts: (hasMore: boolean) => void;
  setDraftCount: (count: number) => void;
  setPostsLoadError: (error: string) => void;
  enabled?: boolean;
  sort?: "newest" | "oldest";
};

export function usePostPagination({
  selectedWorkspaceId,
  nextPostsCursor,
  search,
  statusFilter,
  platformFilter,
  setSavedPosts,
  setNextPostsCursor,
  setHasMorePosts,
  setDraftCount,
  setPostsLoadError,
  enabled = true,
  sort = "newest",
}: UsePostPaginationOptions) {
  const requestKey = JSON.stringify([selectedWorkspaceId, search, statusFilter, platformFilter, enabled, sort]);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const loadingMorePosts = loadingKey === requestKey;
  const pending = useRef<AbortController | null>(null);
  useLayoutEffect(() => () => { pending.current?.abort(); pending.current = null; }, [requestKey]);

  async function handleLoadMorePosts() {
    if (!enabled || !selectedWorkspaceId || !nextPostsCursor || loadingMorePosts || pending.current) {
      return;
    }

    const controller = new AbortController();
    pending.current = controller;
    setLoadingKey(requestKey);
    setPostsLoadError("");

    try {
      const result = await getWorkspacePostsPage(selectedWorkspaceId, {
        cursor: nextPostsCursor,
        signal: controller.signal,
        limit: 20,
        sort,
        search,
        status: statusFilter,
        platform: platformFilter,
      });

      if (controller.signal.aborted) return;
      setSavedPosts((currentPosts) => {
        const existingIds = new Set(currentPosts.map((post) => post._id));
        const newPosts = result.posts.filter(
          (post) => !existingIds.has(post._id),
        );

        return [...currentPosts, ...newPosts];
      });

      setNextPostsCursor(result.nextCursor);
      setHasMorePosts(result.hasMore);
      setDraftCount(result.draftCount);
    } catch (error) {
      if (controller.signal.aborted) return;
      setPostsLoadError(
        error instanceof Error ? error.message : "Unable to load more posts.",
      );
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setLoadingKey(null);
      }
    }
  }

  return {
    loadingMorePosts,
    handleLoadMorePosts,
  };
}
