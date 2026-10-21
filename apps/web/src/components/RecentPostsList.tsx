import { Clock3, MoreHorizontal, Trash2 } from "lucide-react";

export type RecentPostItem = {
  id: string;
  title: string;
  platform: string;
  date: string;
  status: string;
  lastError?: string;
  color: string;
  initials: string;
};

type RecentPostsListProps = {
  posts: RecentPostItem[];
  loading: boolean;
  loadError: string;
  search: string;
  deleteError: string;
  deletingPostId: string | null;
  hasMorePosts: boolean;
  loadingMorePosts: boolean;
  onEdit: (postId: string) => void;
  onDelete: (postId: string, postTitle: string) => void;
  onMoreOptions: (postTitle: string) => void;
  onLoadMore: () => void;
};

export function RecentPostsList({
  posts,
  loading,
  loadError,
  search,
  deleteError,
  deletingPostId,
  hasMorePosts,
  loadingMorePosts,
  onEdit,
  onDelete,
  onMoreOptions,
  onLoadMore,
}: RecentPostsListProps) {
  return (
    <>
      {deleteError && (
        <div
          role="alert"
          className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700"
        >
          {deleteError}
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Loading posts...
          </div>
        ) : loadError ? (
          <div role="alert" className="p-10 text-center text-sm text-rose-600">
            Unable to load posts: {loadError}
          </div>
        ) : posts.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            {search.trim()
              ? "No posts match your search."
              : "No posts yet. Create your first post to get started."}
          </div>
        ) : (
          posts.map((post) => (
            <div
              key={post.id}
              className="flex flex-wrap items-center gap-4 px-5 py-4 transition hover:bg-slate-50/70 sm:px-6"
            >
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${post.color}`}
              >
                {post.initials}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">
                  {post.title}
                </p>
                <p className="mt-1 text-xs text-slate-400">{post.platform}</p>
                {post.status === "Failed" && (
                  <p className="mt-2 text-xs text-rose-700" role="status">
                    {post.lastError ||
                      "Publishing did not complete. Review this post before retrying."}
                  </p>
                )}
              </div>

              <div className="hidden items-center gap-2 text-xs text-slate-500 md:flex">
                <Clock3 size={14} />
                {post.date}
              </div>

              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  post.status === "Published"
                    ? "bg-emerald-50 text-emerald-700"
                    : post.status === "Scheduled"
                      ? "bg-blue-50 text-blue-700"
                      : "bg-amber-50 text-amber-700"
                }`}
              >
                {post.status}
              </span>

              <div className="flex items-center gap-1">
                {post.status === "Draft" && (
                  <button
                    type="button"
                    aria-label={`Edit draft ${post.title}`}
                    title="Edit draft"
                    onClick={() => onEdit(post.id)}
                    className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    <span className="text-xs font-medium">Edit</span>
                  </button>
                )}

                {post.status === "Draft" && (
                  <button
                    type="button"
                    aria-label={`Delete draft ${post.title}`}
                    title="Delete draft"
                    disabled={deletingPostId !== null}
                    onClick={() => onDelete(post.id, post.title)}
                    className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deletingPostId === post.id ? (
                      <span className="text-xs">Deleting...</span>
                    ) : (
                      <Trash2 size={18} />
                    )}
                  </button>
                )}

                <button
                  type="button"
                  aria-label={`More options for ${post.title}`}
                  onClick={() => onMoreOptions(post.title)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <MoreHorizontal size={19} />
                </button>
              </div>
            </div>
          ))
        )}

        {hasMorePosts && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loadingMorePosts}
              className="rounded-md border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingMorePosts ? "Loading..." : "Load more"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
