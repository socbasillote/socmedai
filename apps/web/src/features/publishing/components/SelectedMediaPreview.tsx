import { useEffect, useState } from "react";
import { ImageIcon, RefreshCw } from "lucide-react";

import { getMediaLibraryItem, type MediaLibraryItem } from "@/lib/mediaLibrary";

import { getWorkspaceImageUrl } from "@/lib/imageGeneration";

type Props = {
  assetId: string;
  variant?: "attachment" | "post";
};

type PreviewState = {
  metadata: MediaLibraryItem | null;
  url: string | null;
};

export function SelectedMediaPreview({
  assetId,
  variant = "attachment",
}: Props) {
  const [preview, setPreview] = useState<PreviewState>({
    metadata: null,
    url: null,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let active = true;

    setPreview({
      metadata: null,
      url: null,
    });

    setLoading(true);
    setError("");

    async function loadPreview() {
      try {
        // Step 1: Resolve the asset's original workspace.
        const metadata = await (refreshVersion
          ? getMediaLibraryItem(assetId, true)
          : getMediaLibraryItem(assetId));

        // Step 2: Request a private signed URL using
        // the ORIGINAL workspace, not the current one.
        const signed = await (refreshVersion
          ? getWorkspaceImageUrl(
              metadata.sourceWorkspaceId,
              metadata.assetId,
              true,
            )
          : getWorkspaceImageUrl(metadata.sourceWorkspaceId, metadata.assetId));

        if (!active) return;

        setPreview({
          metadata,
          url: signed.url,
        });
      } catch {
        if (!active) return;

        setError(
          "Unable to load this image preview. " +
            "The saved attachment has not been removed.",
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadPreview();

    return () => {
      active = false;
    };
  }, [assetId, refreshVersion]);

  function refreshPreview() {
    setRefreshVersion((version) => version + 1);
  }

  return (
    <div aria-label="Selected media preview" className="space-y-3">
      <div
        className={variant === "post" ? "space-y-2" : "flex items-start gap-4"}
      >
        <div
          className={
            variant === "post"
              ? "flex min-h-32 w-full items-center justify-center overflow-hidden rounded-lg bg-white"
              : "flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white sm:h-36 sm:w-36"
          }
        >
          {loading ? (
            <div
              role="status"
              className="px-2 text-center text-xs text-slate-500"
            >
              Loading image...
            </div>
          ) : preview.url ? (
            <img
              key={preview.url}
              src={preview.url}
              alt="Selected post image"
              loading="lazy"
              referrerPolicy="no-referrer"
              className={
                variant === "post"
                  ? "max-h-64 w-full object-contain"
                  : "h-full w-full object-cover"
              }
              onError={() => {
                setPreview((current) => ({
                  ...current,
                  url: null,
                }));

                setError(
                  "The image preview is unavailable or " +
                    "its private URL has expired. Refresh to retry.",
                );
              }}
            />
          ) : (
            <ImageIcon
              size={28}
              aria-hidden="true"
              className="text-slate-400"
            />
          )}
        </div>

        {variant !== "post" && (
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm font-semibold text-slate-900">
              Selected image
            </p>

            {preview.metadata ? (
              <>
                <p className="text-xs text-slate-600">Source workspace:</p>

                <p className="break-words text-sm font-normal text-violet-700">
                  {preview.metadata.sourceWorkspaceName}
                </p>

                <p className="text-xs text-slate-500">
                  {preview.metadata.width} × {preview.metadata.height} pixels
                </p>
              </>
            ) : (
              <p className="text-xs text-slate-500">
                {loading
                  ? "Retrieving image details..."
                  : "Image details unavailable."}
              </p>
            )}

            <button
              type="button"
              disabled={loading}
              onClick={refreshPreview}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-normal text-slate-700 disabled:opacity-50"
            >
              <RefreshCw size={13} aria-hidden="true" />
              Refresh preview
            </button>
          </div>
        )}
        {variant === "post" && error && (
          <button
            type="button"
            disabled={loading}
            onClick={refreshPreview}
            className="text-xs font-semibold text-violet-700 underline"
          >
            Retry image preview
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs leading-5 text-amber-700">
          {error}
        </p>
      )}
    </div>
  );
}
