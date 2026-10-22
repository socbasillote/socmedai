import { useState } from "react";
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
}: UsePostPaginationOptions) {
  const [loadingMorePosts, setLoadingMorePosts] = useState(false);

  async function handleLoadMorePosts() {
    if (!selectedWorkspaceId || !nextPostsCursor || loadingMorePosts) {
      return;
    }

    setLoadingMorePosts(true);
    setPostsLoadError("");

    try {
      const result = await getWorkspacePostsPage(selectedWorkspaceId, {
        cursor: nextPostsCursor,
        limit: 20,
        search,
        status: statusFilter,
        platform: platformFilter,
      });

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
      setPostsLoadError(
        error instanceof Error ? error.message : "Unable to load more posts.",
      );
    } finally {
      setLoadingMorePosts(false);
    }
  }

  return {
    loadingMorePosts,
    handleLoadMorePosts,
  };
}
