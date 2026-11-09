import { useEffect, useRef, useState } from "react";

import {
  getWorkspaceImageHistory,
  getWorkspaceImageStatus,
  getWorkspaceImageUrl,
  type ImageHistoryItem,
} from "@/lib/imageGeneration";

import {
  applyImageHistoryStatus,
  isImageStillProcessing,
} from "../lib/imageHistoryState";

type ImageHistoryGalleryProps = {
  selectedWorkspaceId: string | null;
  refreshKey?: string | null;
};

const PAGE_SIZE = 12;

const STATUS_POLL_INTERVAL_MS = 8000;

// Limit concurrent status requests.
// This protects the API when a workspace
// has multiple unfinished operations.
const MAX_STATUS_CHECKS_PER_CYCLE = 3;

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unable to complete this request.";
}

function imageStateLabel(item: ImageHistoryItem): string {
  switch (item.state) {
    case "ready":
      return "Ready";
    case "failed":
      return "Failed";
    case "action_required":
      return "Needs review";
    default:
      return "Processing";
  }
}

function mergeUnique(
  current: ImageHistoryItem[],
  incoming: ImageHistoryItem[],
): ImageHistoryItem[] {
  const ids = new Set<string>();

  return [...current, ...incoming].filter((item) => {
    if (ids.has(item.assetId)) return false;
    ids.add(item.assetId);
    return true;
  });
}

export function ImageHistoryGallery({
  selectedWorkspaceId,
  refreshKey,
}: ImageHistoryGalleryProps) {
  const [items, setItems] = useState<ImageHistoryItem[]>([]);

  const itemsRef = useRef<ImageHistoryItem[]>([]);

  // Always expose the latest rendered list to
  // the polling timer without restarting it
  // whenever a status changes.
  itemsRef.current = items;

  const [cursor, setCursor] = useState<string | null>(null);

  const [hasMore, setHasMore] = useState(false);

  const [loading, setLoading] = useState(false);

  const [loadingMore, setLoadingMore] = useState(false);

  const [error, setError] = useState("");

  const [selected, setSelected] = useState<ImageHistoryItem | null>(null);

  const [previewUrl, setPreviewUrl] = useState("");

  const [previewError, setPreviewError] = useState("");

  const [previewLoading, setPreviewLoading] = useState(false);

  // Incrementing a request version invalidates
  // older asynchronous results.
  const listVersion = useRef(0);
  const previewVersion = useRef(0);
  const currentWorkspace = useRef(selectedWorkspaceId);

  currentWorkspace.current = selectedWorkspaceId;

  const [manualRefresh, setManualRefresh] = useState(0);

  useEffect(() => {
    const version = ++listVersion.current;
    ++previewVersion.current;

    setItems([]);
    setCursor(null);
    setHasMore(false);
    setError("");
    setSelected(null);
    setPreviewUrl("");
    setPreviewError("");
    setPreviewLoading(false);
    setLoadingMore(false);

    if (!selectedWorkspaceId) {
      setLoading(false);

      return () => {
        ++listVersion.current;
        ++previewVersion.current;
      };
    }

    let active = true;

    setLoading(true);

    void getWorkspaceImageHistory(selectedWorkspaceId, { limit: PAGE_SIZE })
      .then((page) => {
        if (!active || version !== listVersion.current) {
          return;
        }

        setItems(page.images);
        setCursor(page.nextCursor);
        setHasMore(page.hasMore);
      })
      .catch((reason: unknown) => {
        if (!active || version !== listVersion.current) {
          return;
        }

        setError(errorMessage(reason));
      })
      .finally(() => {
        if (active && version === listVersion.current) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
      ++listVersion.current;
      ++previewVersion.current;
    };
  }, [selectedWorkspaceId, refreshKey, manualRefresh]);

  useEffect(() => {
    if (!selectedWorkspaceId || loading) {
      return;
    }

    const workspace = selectedWorkspaceId;
    const version = listVersion.current;

    let active = true;
    let polling = false;
    let nextOffset = 0;

    async function pollPendingImages() {
      if (!active || polling) {
        return;
      }

      const pending = itemsRef.current.filter(isImageStillProcessing);

      if (pending.length === 0) {
        return;
      }

      polling = true;

      try {
        // Round-robin selection prevents older
        // pending jobs from starving when there
        // are more than 3 unfinished operations.
        const start = nextOffset % pending.length;

        const selectedJobs = Array.from(
          {
            length: Math.min(MAX_STATUS_CHECKS_PER_CYCLE, pending.length),
          },
          (_, index) => pending[(start + index) % pending.length]!,
        );

        nextOffset = (start + selectedJobs.length) % pending.length;

        // READ-ONLY GET requests.
        // Do not resubmit generation POST.
        const results = await Promise.allSettled(
          selectedJobs.map((item) =>
            getWorkspaceImageStatus(workspace, item.assetId),
          ),
        );

        if (
          !active ||
          version !== listVersion.current ||
          currentWorkspace.current !== workspace
        ) {
          return;
        }

        const updates = new Map(
          results.flatMap((result, index) => {
            if (result.status !== "fulfilled") {
              return [];
            }

            const requestedId = selectedJobs[index]?.assetId;

            // Never apply mismatched asset data.
            if (!requestedId || result.value.assetId !== requestedId) {
              return [];
            }

            return [[requestedId, result.value] as const];
          }),
        );

        if (updates.size === 0) {
          return;
        }

        setItems((previous) => {
          let changed = false;

          const updated = previous.map((item) => {
            const details = updates.get(item.assetId);

            if (!details) {
              return item;
            }

            const next = applyImageHistoryStatus(item, details);

            if (next !== item) {
              changed = true;
            }

            return next;
          });

          return changed ? updated : previous;
        });
      } finally {
        polling = false;
      }
    }

    // Check restored pending operations without
    // waiting for the first interval.
    void pollPendingImages();

    const interval = window.setInterval(() => {
      void pollPendingImages();
    }, STATUS_POLL_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [selectedWorkspaceId, loading, refreshKey, manualRefresh]);

  function refreshHistory() {
    // Prevent a previous "load more" request
    // from modifying the new first page.
    ++listVersion.current;
    setManualRefresh((value) => value + 1);
  }

  async function loadMore() {
    if (!selectedWorkspaceId || loading || loadingMore || !hasMore || !cursor) {
      return;
    }

    const workspace = selectedWorkspaceId;
    const version = listVersion.current;

    setLoadingMore(true);
    setError("");

    try {
      const page = await getWorkspaceImageHistory(workspace, {
        limit: PAGE_SIZE,
        cursor,
      });

      if (
        version !== listVersion.current ||
        currentWorkspace.current !== workspace
      ) {
        return;
      }

      setItems((previous) => mergeUnique(previous, page.images));

      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (reason) {
      if (
        version === listVersion.current &&
        currentWorkspace.current === workspace
      ) {
        setError(errorMessage(reason));
      }
    } finally {
      if (
        version === listVersion.current &&
        currentWorkspace.current === workspace
      ) {
        setLoadingMore(false);
      }
    }
  }

  async function openImage(item: ImageHistoryItem) {
    if (!selectedWorkspaceId || item.state !== "ready") {
      return;
    }

    const workspace = selectedWorkspaceId;
    const version = ++previewVersion.current;

    setSelected(item);
    setPreviewUrl("");
    setPreviewError("");
    setPreviewLoading(true);

    try {
      const result = await getWorkspaceImageUrl(workspace, item.assetId);

      if (
        version !== previewVersion.current ||
        currentWorkspace.current !== workspace
      ) {
        return;
      }

      setPreviewUrl(result.url);
    } catch (reason) {
      if (
        version === previewVersion.current &&
        currentWorkspace.current === workspace
      ) {
        setPreviewError(errorMessage(reason));
      }
    } finally {
      if (
        version === previewVersion.current &&
        currentWorkspace.current === workspace
      ) {
        setPreviewLoading(false);
      }
    }
  }

  function closePreview() {
    ++previewVersion.current;
    setSelected(null);
    setPreviewUrl("");
    setPreviewError("");
    setPreviewLoading(false);
  }

  return (
    <section
      aria-label="Image history"
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Image history
          </h2>

          <p className="text-sm text-slate-500">
            Your previously generated workspace images.
          </p>
        </div>

        <button
          type="button"
          onClick={refreshHistory}
          disabled={!selectedWorkspaceId || loading}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Refresh history
        </button>
      </div>

      {!selectedWorkspaceId && (
        <p className="text-sm text-slate-500">
          Select a workspace to view its images.
        </p>
      )}

      {loading && (
        <p role="status" className="text-sm text-slate-500">
          Loading image history...
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      {!loading && selectedWorkspaceId && items.length === 0 && !error && (
        <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">
          No image generations yet. Generate an image to see it here.
        </p>
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const ready = item.state === "ready";

            return (
              <article
                key={item.assetId}
                className="overflow-hidden rounded-xl border border-slate-200"
              >
                <div className="flex aspect-square items-center justify-center bg-slate-100">
                  <div className="space-y-2 px-4 text-center">
                    <p className="text-sm font-semibold text-slate-700">
                      {imageStateLabel(item)}
                    </p>

                    <p className="text-xs text-slate-500">{item.aspectRatio}</p>

                    {ready && (
                      <button
                        type="button"
                        onClick={() => {
                          void openImage(item);
                        }}
                        className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700"
                        aria-label={`Open image ${item.assetId}`}
                      >
                        Open image
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1 p-3">
                  <p className="text-xs text-slate-500">
                    {new Date(item.createdAt).toLocaleString()}
                  </p>

                  {item.state === "action_required" && (
                    <p className="text-xs text-amber-700">
                      This operation requires review. Do not submit it again.
                    </p>
                  )}

                  {item.state === "processing" && (
                    <div className="space-y-1">
                      <p role="status" className="text-xs text-slate-600">
                        Generation in progress.
                      </p>

                      <p className="text-xs text-slate-500">
                        Status updates automatically. You can leave this page
                        and return without generating another image.
                      </p>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={loading || loadingMore || !selectedWorkspaceId}
            onClick={() => {
              void loadMore();
            }}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loadingMore ? "Loading..." : "Load more"}
          </button>
        </div>
      )}

      {selected && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Generated image preview"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div className="w-full max-w-3xl space-y-4 rounded-2xl bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold text-slate-900">Generated image</h3>

              <button
                type="button"
                onClick={closePreview}
                className="rounded-lg border px-3 py-2 text-sm"
              >
                Close
              </button>
            </div>

            {previewLoading && <p role="status">Loading private preview...</p>}

            {previewError && (
              <p role="alert" className="text-sm text-red-700">
                {previewError}
              </p>
            )}

            {previewUrl && (
              <img
                src={previewUrl}
                alt="Previously generated image"
                referrerPolicy="no-referrer"
                className="mx-auto max-h-[65vh] max-w-full rounded-lg object-contain"
                onError={() => {
                  setPreviewUrl("");
                  setPreviewError(
                    "The private preview could not be loaded. Refresh its access URL.",
                  );
                }}
              />
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={previewLoading}
                onClick={() => {
                  void openImage(selected);
                }}
                className="rounded-lg bg-violet-600 px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                Refresh private URL
              </button>

              <button
                type="button"
                onClick={closePreview}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                Close preview
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Private preview URLs expire. Refresh access if the image stops
              loading.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
