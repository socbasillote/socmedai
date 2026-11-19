import { useEffect, useRef, useState } from "react";
import { getMediaLibraryItem } from "@/lib/mediaLibrary";
import { getWorkspaceImageUrl } from "@/lib/imageGeneration";
import {
  CheckCircle2,
  CircleAlert,
  FileText,
  ImageIcon,
  LoaderCircle,
  Clock3,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import {
  FaFacebook,
  FaInstagram,
  FaTiktok,
  FaYoutube,
  FaLinkedin,
} from "react-icons/fa6";

export type RecentPostItem = {
  id: string;
  mediaId?: string;
  workspaceId?: string;
  timestamp?: string;
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
  onView?: (postId: string) => void;
  onEdit: (postId: string) => void;
  onDelete: (postId: string, postTitle: string) => void;
  onMoreOptions: (postTitle: string) => void;
  onLoadMore: () => void;
};

const socialIcon: Record<
  string,
  React.ComponentType<{ size?: number; color?: string }>
> = {
  facebook: FaFacebook,
  instagram: FaInstagram,
  tiktok: FaTiktok,
  youtube: FaYoutube,
  linkedin: FaLinkedin,
};

const socialColors: Record<string, string> = {
  facebook: "#1877F2",
  instagram: "#E4405F",
  tiktok: "#000000",
  youtube: "#FF0000",
  linkedin: "#0A66C2",
};

function PostThumbnail({ post }: { post: RecentPostItem }) {
  const [image, setImage] = useState<{ id: string; url: string } | null>(null);
  useEffect(() => {
    let active = true;
    if (post.mediaId && post.workspaceId) {
      void Promise.resolve()
        .then(() => getMediaLibraryItem(post.mediaId!))
        .then(async (asset) => {
          if (asset.previewUrl) return { url: asset.previewUrl };
          return getWorkspaceImageUrl(asset.sourceWorkspaceId, asset.assetId);
        })
        .then((result) => {
          if (active) setImage({ id: post.mediaId!, url: result.url });
        })
        .catch(() => {
          /* Keep the placeholder if media is unavailable. */
        });
    }
    return () => {
      active = false;
    };
  }, [post.mediaId, post.workspaceId]);
  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-slate-600">
      {image && image.id === post.mediaId ? (
        <img
          src={image.url}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setImage(null)}
        />
      ) : (
        <ImageIcon
          size={22}
          aria-label={post.mediaId ? "Image unavailable" : "No image"}
        />
      )}
    </div>
  );
}

function PostDate({ post }: { post: RecentPostItem }) {
  const date = post.timestamp ? new Date(post.timestamp) : null;
  if (!date || !Number.isFinite(date.getTime()))
    return <span>{post.date}</span>;
  const now = new Date();
  const yesterday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1,
  );
  const day =
    date.toDateString() === now.toDateString()
      ? "Today"
      : date.toDateString() === yesterday.toDateString()
        ? "Yesterday"
        : date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            ...(date.getFullYear() !== now.getFullYear()
              ? { year: "numeric" }
              : {}),
          });
  const full = date.toLocaleString(undefined, {
    dateStyle: "full",
    timeStyle: "long",
  });
  return (
    <time dateTime={date.toISOString()} title={full} aria-label={full}>
      {day},{" "}
      {date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
    </time>
  );
}

function PostActions({
  post,
  onView,
  onEdit,
  onDelete,
  onMoreOptions,
  deletingPostId,
}: Pick<
  RecentPostsListProps,
  "onView" | "onEdit" | "onDelete" | "onMoreOptions" | "deletingPostId"
> & { post: RecentPostItem }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  const ghost =
    "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-xs font-normal text-slate-700 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-violet-600";
  return (
    <div
      ref={container}
      className="relative ml-auto grid w-[172px] shrink-0 grid-cols-[60px_60px_44px] items-center gap-1"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      {onView ? (
        <button
          className={ghost}
          aria-label={`View details for ${post.title}`}
          onClick={() => onView(post.id)}
        >
          View
        </button>
      ) : (
        <span />
      )}
      {post.status === "Draft" ? (
        <button
          className={ghost}
          aria-label={`Edit draft ${post.title}`}
          onClick={() => onEdit(post.id)}
        >
          Edit
        </button>
      ) : (
        <span />
      )}
      <button
        ref={trigger}
        className={ghost}
        aria-label={`More options for ${post.title}`}
        aria-expanded={open}
        aria-controls={`post-actions-${post.id}`}
        onClick={() => setOpen(!open)}
      >
        <MoreHorizontal size={19} />
      </button>
      {open && (
        <div
          id={`post-actions-${post.id}`}
          className="absolute right-0 top-full z-20 min-w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
        >
          {post.status === "Draft" ? (
            <button
              autoFocus
              disabled={deletingPostId !== null}
              className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
                onDelete(post.id, post.title);
              }}
            >
              <Trash2 size={16} />
              {deletingPostId === post.id ? "Deleting..." : "Delete draft"}
            </button>
          ) : (
            <button
              autoFocus
              className={`${ghost} w-full`}
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
                onMoreOptions(post.title);
              }}
            >
              More details
            </button>
          )}
        </div>
      )}
    </div>
  );
}

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
  onView,
  onDelete,
  onMoreOptions,
  onLoadMore,
}: RecentPostsListProps) {
  return (
    <>
      {deleteError && (
        <div
          role="alert"
          className="border-b border-rose-100 bg-rose-50 px-5 py-2 text-sm text-rose-700"
        >
          {deleteError}
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-600">
            Loading posts...
          </div>
        ) : loadError ? (
          <div role="alert" className="p-10 text-center text-sm text-rose-600">
            Unable to load posts: {loadError}
          </div>
        ) : posts.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-600">
            {search.trim()
              ? "No posts match your search."
              : "No posts yet. Create your first post to get started."}
          </div>
        ) : (
          posts.map((post) => {
            const StatusIcon =
              post.status === "Published"
                ? CheckCircle2
                : post.status === "Scheduled"
                  ? Clock3
                  : post.status === "Draft"
                    ? FileText
                    : post.status === "Publishing"
                      ? LoaderCircle
                      : CircleAlert;

            return (
              <div
                key={post.id}
                className="flex flex-wrap items-center gap-4 px-5 py-4 transition hover:bg-slate-50/70 sm:px-6"
              >
                <PostThumbnail post={post} />

                <div className="min-w-0 flex-1 basis-40">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {post.title}
                  </p>

                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                    {post.platform.split(",").map((platform) => {
                      const key = platform.toLowerCase().trim();
                      const Icon = socialIcon[key];
                      const label =
                        key === "linkedin"
                          ? "LinkedIn"
                          : key.charAt(0).toUpperCase() + key.slice(1);
                      return (
                        <span
                          key={key}
                          className="inline-flex items-center gap-1.5"
                        >
                          {Icon && <Icon size={15} color={socialColors[key]} />}
                          {label}
                        </span>
                      );
                    })}
                  </p>

                  {(post.status === "Failed" ||
                    post.status === "Needs review") && (
                    <p className="mt-2 text-xs text-rose-700" role="status">
                      {post.lastError ||
                        "Publishing did not complete. Review this post before retrying."}
                    </p>
                  )}
                </div>

                <div className="flex w-40 shrink-0 items-center gap-2 text-xs text-slate-600">
                  <Clock3 size={14} />
                  <PostDate post={post} />
                </div>

                <span
                  className={`inline-flex w-28 shrink-0 items-center justify-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    post.status === "Failed" || post.status === "Needs review"
                      ? "bg-rose-50 text-rose-700"
                      : post.status === "Published"
                        ? "bg-emerald-50 text-emerald-700"
                        : post.status === "Scheduled"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-amber-50 text-amber-700"
                  }`}
                >
                  <StatusIcon size={14} aria-hidden="true" />
                  {post.status}
                </span>

                <PostActions
                  post={post}
                  onView={onView}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onMoreOptions={onMoreOptions}
                  deletingPostId={deletingPostId}
                />
              </div>
            );
          })
        )}

        {hasMorePosts && (
          <div className="mt-4 mb-4 flex justify-center">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loadingMorePosts}
              className="min-h-11 rounded-md border px-4 py-2 text-sm font-normal disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingMorePosts ? "Loading..." : "Load more"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
