import { AlertCircle, CalendarClock, FileText, RefreshCw } from "lucide-react";

import type { Post } from "@/lib/posts";

import {
  getPostStatusColor,
  getPostStatusLabel,
} from "@/features/posts/utils/postStatusPresentation";

import {
  usePlannerPostList,
  type PlannerListMode,
} from "../hooks/usePlannerPostList";

type PlannerPostListViewProps = {
  workspaceId: string;
  mode: PlannerListMode;
  onViewPost: (post: Post) => void;
};

function getPostTitle(post: Post): string {
  return post.title?.trim() || post.caption.trim() || "Untitled post";
}

function getDisplayDate(post: Post): string {
  const timestamp =
    post.status === "published"
      ? (post.publishedAt ?? post.createdAt)
      : post.status === "scheduled" ||
          post.status === "publishing" ||
          post.status === "failed"
        ? (post.scheduledAt ?? post.createdAt)
        : post.createdAt;

  const date = new Date(timestamp);

  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleString();
}

export function PlannerPostListView({
  workspaceId,
  mode,
  onViewPost,
}: PlannerPostListViewProps) {
  const { posts, loading, loadingMore, error, hasMore, loadMore, refresh } =
    usePlannerPostList(workspaceId, mode);

  const scheduled = mode === "scheduled";

  const title = scheduled ? "Scheduled Posts" : "All Posts";

  const description = scheduled
    ? "Review your scheduled publishing queue."
    : "Browse drafts, scheduled posts, publishing attempts, published posts, and failures.";

  const Icon = scheduled ? CalendarClock : FileText;

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{title}</h2>

          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>

        {workspaceId && (
          <button
            type="button"
            onClick={refresh}
            disabled={loading || loadingMore}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        )}
      </header>

      {!workspaceId && (
        <p
          role="status"
          className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600"
        >
          Select a workspace to view its posts.
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
        >
          <div className="flex items-center gap-2">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>

          <button
            type="button"
            onClick={posts.length > 0 ? loadMore : refresh}
            disabled={loading || loadingMore}
            className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 font-medium hover:bg-rose-100 disabled:opacity-50"
          >
            <RefreshCw size={15} />
            Retry
          </button>
        </div>
      )}

      {loading && (
        <p
          role="status"
          className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500"
        >
          Loading {title.toLowerCase()}...
        </p>
      )}

      {!loading && !error && workspaceId && posts.length === 0 && (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center">
          <Icon size={32} className="text-slate-400" />

          <h3 className="mt-3 font-semibold text-slate-900">
            {scheduled ? "No scheduled posts" : "No posts yet"}
          </h3>

          <p className="mt-1 text-sm text-slate-500">
            {scheduled
              ? "Posts with scheduled status will appear here."
              : "Create a post in Content Studio or Posts to get started."}
          </p>
        </div>
      )}

      {!loading && posts.length > 0 && (
        <ul className="space-y-3">
          {posts.map((post) => (
            <li
              key={post._id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <button
                type="button"
                onClick={() => onViewPost(post)}
                aria-label={`View post: ${getPostTitle(post)}`}
                className="block w-full rounded-xl p-4 text-left transition hover:bg-violet-50 focus-visible:outline-2 focus-visible:outline-violet-600"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words font-semibold text-slate-900">
                      {getPostTitle(post)}
                    </h3>

                    <p className="mt-1 text-xs text-slate-500">
                      {getDisplayDate(post)}
                      {" · "}
                      {post.platforms.join(", ")}
                    </p>
                  </div>

                  <span
                    className={[
                      "rounded-full px-2.5 py-1 text-xs font-semibold",
                      getPostStatusColor(post.status),
                    ].join(" ")}
                  >
                    {getPostStatusLabel(post.status)}
                  </span>
                </div>

                <p className="mt-3 line-clamp-3 whitespace-pre-wrap break-words text-sm text-slate-600">
                  {post.caption}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!loading && hasMore && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="rounded-xl border border-violet-200 bg-violet-50 px-5 py-2.5 text-sm font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50"
          >
            {loadingMore ? "Loading more..." : "Load More Posts"}
          </button>
        </div>
      )}

      {!loading && workspaceId && posts.length > 0 && !hasMore && (
        <p className="text-center text-xs text-slate-400">
          You've reached the end of this list.
        </p>
      )}
    </section>
  );
}
