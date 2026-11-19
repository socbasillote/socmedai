import { changePostSchedule, reconcilePublication } from "@/lib/posts";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

import type { Post } from "@/lib/posts";
import { formatLocalDateTime } from "@/shared/utils/dateFormat";

type PostDetailsModalProps = {
  post: Post;
  onClose: () => void;
};

function formatDate(value?: string): string {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return formatLocalDateTime(date);
}

function formatStatus(status: Post["status"]): string {
  if (status === "unknown") return "Needs review";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getLinkedInPostUrl(externalPostId?: string): string | null {
  if (!externalPostId) {
    return null;
  }

  // LinkedIn publishing currently returns URNs such as:
  // urn:li:share:7520618256152530944
  // urn:li:ugcPost:1234567890123456789

  if (!/^urn:li:(share|ugcPost):\d+$/.test(externalPostId)) {
    return null;
  }

  return `https://www.linkedin.com/feed/update/${encodeURIComponent(
    externalPostId,
  )}/`;
}

export function PostDetailsModal({
  post: initialPost,
  onClose,
}: PostDetailsModalProps) {
  const [post, setPost] = useState(initialPost);
  const [schedule, setSchedule] = useState("");
  const [pendingSchedule, setPendingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  async function changeSchedule(action: "cancel" | "reschedule" | "reconcile") {
    if (pendingSchedule) return;
    if (
      action === "reschedule" &&
      (!schedule ||
        !Number.isFinite(new Date(schedule).getTime()) ||
        new Date(schedule).getTime() <= Date.now())
    ) {
      setScheduleError("Choose a valid future date and time.");
      return;
    }
    setPendingSchedule(true);
    setScheduleError("");
    try {
      setPost(
        action === "reconcile"
          ? await reconcilePublication(post._id)
          : await changePostSchedule(
              post._id,
              action === "reschedule"
                ? new Date(schedule).toISOString()
                : undefined,
            ),
      );
      window.dispatchEvent(new Event("storm:posts-changed"));
    } catch (error) {
      setScheduleError(
        error instanceof Error ? error.message : "Unable to update this post.",
      );
    } finally {
      setPendingSchedule(false);
    }
  }
  const publishingResults = post.platformResults ?? [];

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="post-details-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-5">
          <h2
            id="post-details-title"
            className="text-xl font-bold text-slate-900"
          >
            Post Details
          </h2>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close post details"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-6 p-6">
          {post.title && (
            <section>
              <h3 className="text-sm font-semibold text-slate-500">Title</h3>

              <p className="mt-2 text-base font-normal text-slate-900">
                {post.title}
              </p>
            </section>
          )}

          <section>
            <h3 className="text-sm font-semibold text-slate-500">Caption</h3>

            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-slate-800">
              {post.caption}
            </p>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-500">Platforms</h3>

            <div className="mt-2 flex flex-wrap gap-2">
              {post.platforms.map((platform) => (
                <span
                  key={platform}
                  className="rounded-full bg-violet-50 px-2 py-1 text-xs font-semibold capitalize text-violet-700"
                >
                  {platform}
                </span>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-500">Status</h3>

            <span className="mt-2 inline-flex rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
              {formatStatus(post.status)}
            </span>
          </section>

          <div className="grid gap-5 border-t border-slate-100 pt-5 sm:grid-cols-2">
            <section>
              <h3 className="text-sm font-semibold text-slate-500">Created</h3>

              <p className="mt-2 text-sm text-slate-800">
                {formatDate(post.createdAt)}
              </p>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-slate-500">
                Last Updated
              </h3>

              <p className="mt-2 text-sm text-slate-800">
                {formatDate(post.updatedAt)}
              </p>
            </section>

            {post.scheduledAt && (
              <section>
                <h3 className="text-sm font-semibold text-slate-500">
                  Scheduled For
                </h3>

                <p className="mt-2 text-sm text-slate-800">
                  {formatDate(post.scheduledAt)}
                </p>
              </section>
            )}

            {post.publishedAt && (
              <section>
                <h3 className="text-sm font-semibold text-slate-500">
                  Published
                </h3>

                <p className="mt-2 text-sm text-slate-800">
                  {formatDate(post.publishedAt)}
                </p>
              </section>
            )}
          </div>

          {publishingResults.map((result) => {
            const platformLabel =
              result.platform === "facebook"
                ? "Facebook"
                : result.platform === "linkedin"
                  ? "LinkedIn"
                  : "Instagram";
            const postUrl =
              result.platform === "linkedin"
                ? getLinkedInPostUrl(result.externalPostId)
                : result.platform === "facebook" &&
                    /^\d+(?:_\d+)?$/.test(result.externalPostId ?? "")
                  ? `https://www.facebook.com/${result.externalPostId}`
                  : null;
            return (
              <section
                key={result.platform}
                className="rounded-xl border border-slate-200 bg-slate-50 p-5"
              >
                <h3 className="text-sm font-bold text-slate-900">
                  {platformLabel} Publishing Details
                </h3>
                <div className="mt-4 space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500">
                      Publishing Status
                    </p>
                    <p className="mt-1 text-sm font-semibold capitalize text-slate-800">
                      {result.status}
                    </p>
                  </div>
                  {result.publishedAt && (
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-500">
                        Published on {platformLabel}
                      </p>
                      <p className="mt-1 text-sm text-slate-800">
                        {formatDate(result.publishedAt)}
                      </p>
                    </div>
                  )}
                  {result.externalPostId && (
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-500">
                        {platformLabel} Post ID
                      </p>
                      <p className="mt-1 break-all font-mono text-xs text-slate-700">
                        {result.externalPostId}
                      </p>
                    </div>
                  )}
                  {result.lastError && (
                    <div role="alert">
                      <p className="text-xs font-semibold uppercase text-rose-600">
                        Publishing Error
                      </p>
                      <p className="mt-1 text-sm text-rose-700">
                        {result.lastError}
                      </p>
                    </div>
                  )}
                  {result.status === "published" && postUrl && (
                    <a
                      href={postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white"
                    >
                      View on {platformLabel}
                    </a>
                  )}
                </div>
              </section>
            );
          })}

          {post.status === "scheduled" && (
            <section className="space-y-3 rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold">Manage schedule</h3>
              <label className="block text-sm">
                New publishing time
                <input
                  aria-label="New publishing time"
                  type="datetime-local"
                  value={schedule}
                  onChange={(event) => setSchedule(event.target.value)}
                  disabled={pendingSchedule}
                  className="mt-2 w-full rounded-lg border p-2"
                />
              </label>
              <p className="text-xs text-slate-500">
                Times use your browser's local time zone. Cancelling returns the
                post to drafts.
              </p>
              <button
                type="button"
                disabled={pendingSchedule}
                onClick={() => void changeSchedule("reschedule")}
                className="mr-3 rounded-lg bg-violet-600 px-2 py-2 text-sm text-white"
              >
                Reschedule
              </button>
              <button
                type="button"
                disabled={pendingSchedule}
                onClick={() => void changeSchedule("cancel")}
                className="rounded-lg border px-2 py-2 text-sm"
              >
                Cancel schedule
              </button>
            </section>
          )}
          {post.status === "unknown" && (
            <button
              type="button"
              disabled={pendingSchedule}
              onClick={() => void changeSchedule("reconcile")}
              className="rounded-lg border px-2 py-2 text-sm"
            >
              Reconcile confirmed publication
            </button>
          )}
          {scheduleError && (
            <p role="alert" className="text-sm text-rose-700">
              {scheduleError}
            </p>
          )}
          {post.lastError && (
            <section
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 p-4"
            >
              <h3 className="text-sm font-semibold text-rose-800">
                Publishing Error
              </h3>

              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-rose-700">
                {post.lastError}
              </p>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex justify-end border-t border-slate-100 bg-white px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
