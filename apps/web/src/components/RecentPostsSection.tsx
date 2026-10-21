import { RecentPostsHeader } from "@/components/RecentPostsHeader";
import {
  RecentPostsList,
  type RecentPostItem,
} from "@/components/RecentPostsList";
import { DraftEditForm } from "@/components/DraftEditForm";
import type {
  PostStatusFilter,
  PostPlatformFilter,
} from "@/components/RecentPostsHeader";
import type { Platform } from "@/components/DraftEditForm";

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

  editingPostId: string | null;
  editTitle: string;
  editCaption: string;
  editPlatforms: Platform[];
  savingEdit: boolean;
  editPostError: string;
  onEditTitleChange: (value: string) => void;
  onEditCaptionChange: (value: string) => void;
  onEditPlatformsChange: (value: Platform[]) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
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
  editingPostId,
  editTitle,
  editCaption,
  editPlatforms,
  savingEdit,
  editPostError,
  onEditTitleChange,
  onEditCaptionChange,
  onEditPlatformsChange,
  onSaveEdit,
  onCancelEdit,
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
          className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700"
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

      {editingPostId && (
        <DraftEditForm
          title={editTitle}
          caption={editCaption}
          platforms={editPlatforms}
          saving={savingEdit}
          error={editPostError}
          onTitleChange={onEditTitleChange}
          onCaptionChange={onEditCaptionChange}
          onPlatformsChange={onEditPlatformsChange}
          onSave={onSaveEdit}
          onCancel={onCancelEdit}
        />
      )}

      <div className="border-t border-slate-100 px-5 py-4 sm:px-6">
        <p className="text-xs text-slate-400">
          Showing saved posts from this workspace.
        </p>
      </div>
    </section>
  );
}
