import { useCallback, useMemo, useState } from "react";

import { usePosts } from "@/hooks/usePosts";
import { usePostFilters } from "@/hooks/usePostFilters";
import { usePostPagination } from "@/hooks/usePostPagination";
import { usePostActions } from "@/hooks/usePostActions";
import { useDraftEditing } from "@/hooks/useDraftEditing";

import type { Post } from "@/lib/posts";

import { toRecentPostItems } from "@/features/posts/utils/postPresentation";

type NoticeHandler = Parameters<typeof usePostActions>[0]["setNotice"];

/**
 * Dashboard post management orchestration.
 *
 * Owns:
 * - Post filters
 * - Workspace-scoped post loading
 * - Pagination coordination
 * - Draft editing and deletion
 * - Selected post details
 * - Derived presentation data
 * - Local updates after Content Studio saves
 *
 * Does not:
 * - Render UI
 * - Implement API requests directly
 * - Publish or schedule posts
 * - Manage social media connections
 */
export function useDashboardPosts(
  selectedWorkspaceId: string,
  setNotice: NoticeHandler,
) {
  // 1. Filter state
  const {
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    platformFilter,
    setPlatformFilter,
  } = usePostFilters();

  // 2. Workspace-scoped post data
  const {
    savedPosts,
    setSavedPosts,
    draftCount,
    setDraftCount,
    postsLoading,
    postsLoadError,
    setPostsLoadError,
    nextPostsCursor,
    setNextPostsCursor,
    hasMorePosts,
    setHasMorePosts,
  } = usePosts(selectedWorkspaceId, search, statusFilter, platformFilter);

  // 3. Pagination
  const { loadingMorePosts, handleLoadMorePosts } = usePostPagination({
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
  });

  // 4. Draft deletion
  const { deletingPostId, deletePostError, handleDeleteDraft } = usePostActions(
    {
      setSavedPosts,
      setNotice,
    },
  );

  // 5. Draft editing
  const {
    editingPostId,
    editTitle,
    setEditTitle,
    editCaption,
    setEditCaption,
    editPlatforms,
    setEditPlatforms,
    savingEdit,
    editPostError,
    handleEditDraft,
    handleSaveDraftEdit,
    cancelEdit,
  } = useDraftEditing({
    setSavedPosts,
    setNotice,
  });

  // 6. Post details selection
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  // 7. Memoized display transformation
  const savedPostItems = useMemo(
    () => toRecentPostItems(savedPosts),
    [savedPosts],
  );

  // Existing usePosts hook already receives
  // search, status and platform filters.
  // Do not filter the result a second time.
  const filteredPosts = savedPostItems;

  // 8. Memoized selected post
  const selectedPost = useMemo(
    () =>
      selectedPostId
        ? (savedPosts.find((post) => post._id === selectedPostId) ?? null)
        : null,
    [savedPosts, selectedPostId],
  );

  /**
   * Preserve the existing Content Studio
   * post-save coordination.
   *
   * This keeps the current behavior unchanged
   * during the architecture refactor.
   */
  const handleStudioPostSaved = useCallback(
    (post: Post) => {
      setSavedPosts((current) => [
        post,
        ...current.filter((item) => item._id !== post._id),
      ]);

      if (post.status === "draft") {
        setDraftCount((current) => current + 1);
      }

      setNotice(
        post.status === "scheduled"
          ? "Post scheduled successfully."
          : "Draft saved to your workspace.",
      );
    },
    [setSavedPosts, setDraftCount, setNotice],
  );

  return {
    // Filters
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    platformFilter,
    setPlatformFilter,

    // Posts
    savedPosts,
    draftCount,
    postsLoading,
    postsLoadError,
    hasMorePosts,

    // Presentation
    filteredPosts,

    // Pagination
    loadingMorePosts,
    handleLoadMorePosts,

    // Deletion
    deletingPostId,
    deletePostError,
    handleDeleteDraft,

    // Editing
    editingPostId,
    editTitle,
    setEditTitle,
    editCaption,
    setEditCaption,
    editPlatforms,
    setEditPlatforms,
    savingEdit,
    editPostError,
    handleEditDraft,
    handleSaveDraftEdit,
    cancelEdit,

    // Details
    selectedPostId,
    setSelectedPostId,
    selectedPost,

    // Content Studio coordination
    handleStudioPostSaved,
  };
}
