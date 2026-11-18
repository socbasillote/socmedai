import { useEffect, useState } from "react";
import { getWorkspacePostsPage, type Post } from "@/lib/posts";

type PostStatusFilter = "all" | "draft" | "scheduled" | "published" | "failed";

type PostPlatformFilter = "all" | "facebook" | "instagram" | "linkedin";

export function usePosts(
  selectedWorkspaceId: string,
  search: string,
  statusFilter: PostStatusFilter,
  platformFilter: PostPlatformFilter,
  enabled = true,
) {
  const [savedPosts, setSavedPosts] = useState<Post[]>([]);
  const [draftCount, setDraftCount] = useState(0);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsLoadError, setPostsLoadError] = useState("");
  const [nextPostsCursor, setNextPostsCursor] = useState<string | null>(null);
  const [hasMorePosts, setHasMorePosts] = useState(false);

  const [refreshVersion, setRefreshVersion] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const refresh = () => setRefreshVersion((version) => version + 1);
    window.addEventListener("storm:posts-changed", refresh);
    return () => window.removeEventListener("storm:posts-changed", refresh);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    if (!enabled || search !== debouncedSearch) return;

    async function loadPosts() {
      if (!selectedWorkspaceId) {
        setSavedPosts([]);
        setDraftCount(0);
        setNextPostsCursor(null);
        setHasMorePosts(false);
        setPostsLoading(false);
        setPostsLoadError("");
        return;
      }

      setPostsLoading(true);
      setPostsLoadError("");
      setNextPostsCursor(null);
      setHasMorePosts(false);

      try {
        const result = await getWorkspacePostsPage(selectedWorkspaceId, {
          limit: 20,
          search: debouncedSearch,
          signal: controller.signal,
          status: statusFilter,
          platform: platformFilter,
        });

        if (!active) return;

        setSavedPosts(result.posts);
        setDraftCount(result.draftCount);
        setNextPostsCursor(result.nextCursor);
        setHasMorePosts(result.hasMore);
      } catch (error) {
        if (!active) return;

        setSavedPosts([]);
        setDraftCount(0);
        setNextPostsCursor(null);
        setHasMorePosts(false);
        setPostsLoadError(
          error instanceof Error
            ? error.message
            : "Unable to load workspace posts.",
        );
      } finally {
        if (active) {
          setPostsLoading(false);
        }
      }
    }

    void loadPosts();

    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedWorkspaceId, search, debouncedSearch, statusFilter, platformFilter, enabled, refreshVersion]);

  return {
    savedPosts,
    setSavedPosts,
    draftCount,
    setDraftCount,
    postsLoading: enabled && (postsLoading || search !== debouncedSearch),
    setPostsLoading,
    postsLoadError,
    setPostsLoadError,
    nextPostsCursor: search === debouncedSearch ? nextPostsCursor : null,
    setNextPostsCursor,
    hasMorePosts: search === debouncedSearch && hasMorePosts,
    setHasMorePosts,
  };
}
