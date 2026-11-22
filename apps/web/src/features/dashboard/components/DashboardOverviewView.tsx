import { DraftDeleteConfirmation } from "@/features/posts/components/DraftDeleteConfirmation";
import { DashboardOverview } from "@/components/DashboardOverview";

import type { useDashboardPosts } from "@/features/posts/hooks/useDashboardPosts";

type DashboardPostsState = ReturnType<typeof useDashboardPosts>;

type DashboardOverviewViewProps = {
  posts: DashboardPostsState;
  onCreatePost: () => void;
  onEditDraft: (postId: string) => void;
  onOpenStudio: () => void;
  onViewPublishing: () => void;
  onMoreOptions: (postTitle: string) => void;
};

/**
 * Dashboard Overview presentation adapter.
 *
 * Responsibilities:
 * - Connect the Posts feature state to DashboardOverview.
 * - Forward draft editing to PostEditor.
 * - Forward user interactions to existing handlers.
 *
 * Does not:
 * - Fetch posts directly.
 * - Own the workspace selection.
 * - Call the backend.
 * - Perform publishing operations.
 */
export function DashboardOverviewView({
  posts,
  onCreatePost,
  onEditDraft,
  onOpenStudio,
  onViewPublishing,
  onMoreOptions,
}: DashboardOverviewViewProps) {
  return (
    <DraftDeleteConfirmation posts={posts}>{(requestDelete) => <DashboardOverview
      draftCount={posts.draftCount}
      statusFilter={posts.statusFilter}
      setStatusFilter={posts.setStatusFilter}
      platformFilter={posts.platformFilter}
      setPlatformFilter={posts.setPlatformFilter}
      deletePostError={posts.deletePostError}
      posts={posts.filteredPosts}
      postsLoading={posts.postsLoading}
      postsLoadError={posts.postsLoadError}
      search={posts.search}
      deletingPostId={posts.deletingPostId}
      hasMorePosts={posts.hasMorePosts}
      loadingMorePosts={posts.loadingMorePosts}
      onEdit={(postId) => {
        const draft = posts.savedPosts.find(
          (item) => item._id === postId && item.status === "draft",
        );

        if (draft) {
          onEditDraft(draft._id);
        }
      }}
      onDelete={requestDelete}
      onMoreOptions={onMoreOptions}
      onLoadMore={posts.handleLoadMorePosts}
      onCreatePost={onCreatePost}
      onOpenStudio={onOpenStudio}
      onViewPublishing={onViewPublishing}
    />}</DraftDeleteConfirmation>
  );
}
