import { useEffect, useState } from "react";
import { CheckCircle2, ImageIcon, RefreshCw } from "lucide-react";

import {
  getWorkspaceImageHistory,
  getWorkspaceImageUrl,
} from "@/lib/imageGeneration";

type LibraryImage = {
  assetId: string;
  url: string | null;
};

type Props = {
  workspaceId: string | null;
  selectedAssetId: string | null;
  disabled?: boolean;
  onSelect: (assetId: string) => void;
};

export function MediaLibraryPicker({
  workspaceId,
  selectedAssetId,
  disabled = false,
  onSelect,
}: Props) {
  const [images, setImages] = useState<LibraryImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let active = true;

    setImages([]);
    setError("");

    if (!workspaceId) {
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);

    async function loadImages() {
      if (!workspaceId) return;

      try {
        const history = await getWorkspaceImageHistory(workspaceId, {
          limit: 12,
        });

        const readyImages = history.images.filter(
          (image) => image.status === "ready" && image.state === "ready",
        );

        // Private image URLs are short-lived.
        // Retrieve them only for visible images.
        const results = await Promise.all(
          readyImages.map(async (image) => {
            try {
              const preview = await getWorkspaceImageUrl(
                workspaceId,
                image.assetId,
              );

              return {
                assetId: image.assetId,
                url: preview.url,
              };
            } catch {
              return {
                assetId: image.assetId,
                url: null,
              };
            }
          }),
        );

        if (!active) return;

        setImages(results);
      } catch {
        if (!active) return;

        setError("Unable to load your workspace images. Try again.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadImages();

    return () => {
      active = false;
    };
  }, [workspaceId, refreshVersion]);

  return (
    <section aria-label="Media Library picker" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Media Library
          </h3>

          <p className="mt-1 text-xs text-slate-500">
            Choose a previously generated image.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setRefreshVersion((value) => value + 1)}
          disabled={loading || disabled || !workspaceId}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-50"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {!workspaceId && (
        <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          Select a workspace to view its images.
        </p>
      )}

      {loading && (
        <p role="status" className="text-sm text-slate-500">
          Loading images...
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}

      {!loading && !error && workspaceId && images.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center">
          <ImageIcon size={28} className="mx-auto text-slate-400" />

          <p className="mt-2 text-sm font-medium text-slate-700">
            No ready images found
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Generate an image in Image Studio, then refresh this library.
          </p>
        </div>
      )}

      {!loading && images.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((image) => {
            const selected = selectedAssetId === image.assetId;

            return (
              <button
                key={image.assetId}
                type="button"
                aria-label={`Select image ${image.assetId}`}
                aria-pressed={selected}
                disabled={disabled || !image.url || !workspaceId}
                onClick={() => onSelect(image.assetId)}
                className={[
                  "relative aspect-square overflow-hidden",
                  "rounded-xl border-2 bg-slate-50",
                  "transition focus-visible:outline",
                  "focus-visible:outline-2",
                  "focus-visible:outline-violet-600",
                  "disabled:cursor-not-allowed",
                  "disabled:opacity-60",
                  selected
                    ? "border-violet-600"
                    : "border-transparent hover:border-violet-300",
                ].join(" ")}
              >
                {image.url ? (
                  <img
                    src={image.url}
                    alt="Generated workspace image"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                    onError={() => {
                      setImages((current) =>
                        current.map((item) =>
                          item.assetId === image.assetId
                            ? { ...item, url: null }
                            : item,
                        ),
                      );
                    }}
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 p-2 text-center">
                    <ImageIcon size={22} className="text-slate-400" />

                    <span className="text-xs text-slate-500">
                      Preview unavailable
                    </span>
                  </div>
                )}

                {selected && (
                  <span className="absolute right-2 top-2 rounded-full bg-white p-1 text-violet-700 shadow">
                    <CheckCircle2 size={19} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <p className="text-xs leading-5 text-slate-500">
        Showing up to 12 recent ready images. Images remain stored in your
        workspace. Selecting one does not generate another image.
      </p>
    </section>
  );
}
