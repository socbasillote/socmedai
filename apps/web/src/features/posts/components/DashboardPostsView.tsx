import { PostsPage } from "@/components/PostsPage";
import { RecentPostsList } from "@/components/RecentPostsList";

import type { useDashboardPosts } from "@/features/posts/hooks/useDashboardPosts";

type DashboardPostsState = ReturnType<typeof useDashboardPosts>;

type DashboardPostsViewProps = {
  posts: DashboardPostsState;
  onEditDraft: (postId: string) => void;
  onMoreOptions: (postTitle: string) => void;
};

/**
 * Existing Posts page presentation adapter.
 *
 * Responsibilities:
 * - Render the existing PostsPage.
 * - Render the existing RecentPostsList.
 * - Forward filtering, pagination, and actions.
 *
 * Does not:
 * - Fetch posts directly.
 * - Create independent post state.
 * - Navigate directly.
 * - Publish posts.
 */
export function DashboardPostsView({
  posts,
  onEditDraft,
  onMoreOptions,
}: DashboardPostsViewProps) {
  return (
    <PostsPage
      search={posts.search}
      statusFilter={posts.statusFilter}
      platformFilter={posts.platformFilter}
      onSearchChange={posts.setSearch}
      onStatusFilterChange={posts.setStatusFilter}
      onPlatformFilterChange={posts.setPlatformFilter}
    >
      <RecentPostsList
        posts={posts.filteredPosts}
        loading={posts.postsLoading}
        loadError={posts.postsLoadError}
        onView={posts.setSelectedPostId}
        search={posts.search}
        deleteError={posts.deletePostError}
        deletingPostId={posts.deletingPostId}
        hasMorePosts={posts.hasMorePosts}
        loadingMorePosts={posts.loadingMorePosts}
        onEdit={(postId) => {
          const draft = posts.savedPosts.find(
            (item) => item._id === postId && item.status === "draft",
          );

          if (!draft) {
            return;
          }

          onEditDraft(draft._id);
        }}
        onDelete={(postId, postTitle) => {
          void posts.handleDeleteDraft(postId, postTitle);
        }}
        onMoreOptions={onMoreOptions}
        onLoadMore={posts.handleLoadMorePosts}
      />
    </PostsPage>
  );
}
