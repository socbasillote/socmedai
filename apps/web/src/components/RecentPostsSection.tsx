import { RecentPostsHeader } from "@/components/RecentPostsHeader";
import {
  RecentPostsList,
  type RecentPostItem,
} from "@/components/RecentPostsList";
import type {
  PostStatusFilter,
  PostPlatformFilter,
} from "@/components/RecentPostsHeader";

type RecentPostsSectionProps = {
  statusFilter: PostStatusFilter;
  setStatusFilter: (value: PostStatusFilter) => void;
  platformFilter: PostPlatformFilter;
  setPlatformFilter: (value: PostPlatformFilter) => void;
  onViewPublishing: () => void;

  deletePostError: string;
  posts: RecentPostItem[];
  loading: boolean;
  loadError: string;
  search: string;
  deletingPostId: string | null;
  hasMorePosts: boolean;
  loadingMorePosts: boolean;

  onEdit: (postId: string) => void;
  onDelete: (postId: string, postTitle: string) => void;
  onMoreOptions: (postTitle: string) => void;
  onLoadMore: () => void;

};

export function RecentPostsSection({
  statusFilter,
  setStatusFilter,
  platformFilter,
  setPlatformFilter,
  onViewPublishing,
  deletePostError,
  posts,
  loading,
  loadError,
  search,
  deletingPostId,
  hasMorePosts,
  loadingMorePosts,
  onEdit,
  onDelete,
  onMoreOptions,
  onLoadMore,
}: RecentPostsSectionProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <RecentPostsHeader
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        platformFilter={platformFilter}
        setPlatformFilter={setPlatformFilter}
        onViewPublishing={onViewPublishing}
      />

      {deletePostError && (
        <div
          role="alert"
          className="border-b border-rose-100 bg-rose-50 px-5 py-2 text-sm text-rose-700"
        >
          {deletePostError}
        </div>
      )}

      <RecentPostsList
        posts={posts}
        loading={loading}
        loadError={loadError}
        search={search}
        deleteError={deletePostError}
        deletingPostId={deletingPostId}
        hasMorePosts={hasMorePosts}
        loadingMorePosts={loadingMorePosts}
        onEdit={onEdit}
        onDelete={onDelete}
        onMoreOptions={onMoreOptions}
        onLoadMore={onLoadMore}
      />

      <div className="border-t border-slate-100 px-5 py-4 sm:px-6">
        <p className="text-xs text-slate-400">
          Showing saved posts from this workspace.
        </p>
      </div>
    </section>
  );
}
