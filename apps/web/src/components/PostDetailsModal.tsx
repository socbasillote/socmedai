import { useEffect } from "react";
import { X } from "lucide-react";

import type { Post } from "@/lib/posts";

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

  return date.toLocaleString();
}

function formatStatus(status: Post["status"]): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getLinkedInPublishingResult(post: Post) {
  return post.platformResults?.find((result) => result.platform === "linkedin");
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

export function PostDetailsModal({ post, onClose }: PostDetailsModalProps) {
  const linkedInResult = getLinkedInPublishingResult(post);

  const linkedInPostUrl = getLinkedInPostUrl(linkedInResult?.externalPostId);

  console.log("[Storm] Post publishing debug:", {
    postId: post._id,
    postStatus: post.status,
    platformResults: post.platformResults,
    linkedInResult,
    linkedInPostUrl,
    shouldShowLinkedInButton:
      linkedInResult?.status === "published" && Boolean(linkedInPostUrl),
  });

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

              <p className="mt-2 text-base font-medium text-slate-900">
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
                  className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold capitalize text-violet-700"
                >
                  {platform}
                </span>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-500">Status</h3>

            <span className="mt-2 inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
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

          {linkedInResult && (
            <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
              <h3 className="text-sm font-bold text-slate-900">
                LinkedIn Publishing Details
              </h3>

              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">
                    Publishing Status
                  </p>

                  <p className="mt-1 text-sm font-semibold capitalize text-slate-800">
                    {linkedInResult.status}
                  </p>
                </div>

                {linkedInResult.publishedAt && (
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500">
                      Published on LinkedIn
                    </p>

                    <p className="mt-1 text-sm text-slate-800">
                      {formatDate(linkedInResult.publishedAt)}
                    </p>
                  </div>
                )}

                {linkedInResult.externalPostId && (
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500">
                      LinkedIn Post ID
                    </p>

                    <p className="mt-1 break-all font-mono text-xs text-slate-700">
                      {linkedInResult.externalPostId}
                    </p>
                  </div>
                )}

                {linkedInResult.lastError && (
                  <div role="alert">
                    <p className="text-xs font-semibold uppercase text-rose-600">
                      Publishing Error
                    </p>

                    <p className="mt-1 text-sm text-rose-700">
                      {linkedInResult.lastError}
                    </p>
                  </div>
                )}

                {linkedInResult.status === "published" && linkedInPostUrl && (
                  <a
                    href={linkedInPostUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-xl bg-[#0A66C2] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#004182]"
                  >
                    View on LinkedIn ↗
                  </a>
                )}
              </div>
            </section>
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
