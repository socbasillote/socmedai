import { DashboardOverview } from "@/components/DashboardOverview";

import type { useDashboardPosts } from "@/features/posts/hooks/useDashboardPosts";

type DashboardPostsState = ReturnType<typeof useDashboardPosts>;

type DashboardOverviewViewProps = {
  posts: DashboardPostsState;
  onCreatePost: () => void;
  onOpenStudio: () => void;
  onViewPublishing: () => void;
  onMoreOptions: (postTitle: string) => void;
};

/**
 * Dashboard Overview presentation adapter.
 *
 * Responsibilities:
 * - Connect the Posts feature state to DashboardOverview.
 * - Preserve inline draft editing.
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
  onOpenStudio,
  onViewPublishing,
  onMoreOptions,
}: DashboardOverviewViewProps) {
  return (
    <DashboardOverview
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
        const draft = posts.savedPosts.find((item) => item._id === postId);

        if (draft) {
          posts.handleEditDraft(draft);
        }
      }}
      onDelete={(postId, postTitle) => {
        void posts.handleDeleteDraft(postId, postTitle);
      }}
      onMoreOptions={onMoreOptions}
      onLoadMore={posts.handleLoadMorePosts}
      editingPostId={posts.editingPostId}
      editTitle={posts.editTitle}
      editCaption={posts.editCaption}
      editPlatforms={posts.editPlatforms}
      savingEdit={posts.savingEdit}
      editPostError={posts.editPostError}
      onEditTitleChange={posts.setEditTitle}
      onEditCaptionChange={posts.setEditCaption}
      onEditPlatformsChange={posts.setEditPlatforms}
      onSaveEdit={() => void posts.handleSaveDraftEdit()}
      onCancelEdit={posts.cancelEdit}
      onCreatePost={onCreatePost}
      onOpenStudio={onOpenStudio}
      onViewPublishing={onViewPublishing}
    />
  );
}
