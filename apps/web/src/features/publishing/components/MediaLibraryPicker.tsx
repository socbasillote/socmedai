import { useEffect, useState } from "react";
import { CheckCircle2, ImageIcon, RefreshCw } from "lucide-react";

import { getWorkspaceImageUrl } from "@/lib/imageGeneration";

import {
  getMediaLibrary,
  type MediaLibraryItem,
  type MediaLibraryScope,
} from "@/lib/mediaLibrary";

type LibraryImage = MediaLibraryItem & {
  previewUrl: string | null;
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
  const [scope, setScope] = useState<MediaLibraryScope>("current");

  const [images, setImages] = useState<LibraryImage[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    // A new active workspace should always
    // start with the Current Workspace filter.
    setScope("current");
    setImages([]);
    setError("");
  }, [workspaceId]);

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
        const response = await getMediaLibrary(workspaceId, scope, 12);

        if (!active) return;

        // Every asset carries its source workspace.
        // Signed URLs must be requested against
        // THAT workspace, not the active workspace.
        const results = await Promise.all(
          response.images.map(async (image) => {
            try {
              const access = await getWorkspaceImageUrl(
                image.sourceWorkspaceId,
                image.assetId,
              );

              return {
                ...image,
                previewUrl: access.url,
              };
            } catch {
              return {
                ...image,
                previewUrl: null,
              };
            }
          }),
        );

        if (!active) return;

        setImages(results);
      } catch {
        if (!active) return;

        setError("Unable to load Media Library images. Try again.");
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
  }, [workspaceId, scope, refreshVersion]);

  function changeScope(nextScope: MediaLibraryScope) {
    if (nextScope === scope) return;

    setScope(nextScope);
  }

  return (
    <section aria-label="Media Library picker" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Media Library
          </h3>

          <p className="mt-1 text-xs text-slate-500">
            Reuse images without generating them again.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setRefreshVersion((value) => value + 1)}
          disabled={loading || disabled || !workspaceId}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-50"
        >
          <RefreshCw size={14} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <fieldset disabled={disabled || !workspaceId} className="space-y-2">
        <legend className="text-xs font-semibold text-slate-700">
          Show images from
        </legend>

        <div className="grid grid-cols-2 gap-2">
          {(
            [
              {
                value: "current",
                label: "Current Workspace",
              },
              {
                value: "all",
                label: "All Workspaces",
              },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={scope === option.value}
              onClick={() => changeScope(option.value)}
              className={[
                "rounded-xl border px-3 py-2.5",
                "text-xs font-semibold transition",
                "disabled:opacity-50",
                scope === option.value
                  ? "border-violet-300 bg-violet-50 text-violet-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              ].join(" ")}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <p className="text-xs text-slate-500">
        {scope === "current"
          ? "Showing images from your active workspace."
          : "Showing images from all workspaces you own."}
      </p>

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
            {scope === "current"
              ? "Try All Workspaces or generate a new image."
              : "Generate an image in Image Studio, then refresh."}
          </p>
        </div>
      )}

      {!loading && images.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((image) => {
            const selected = selectedAssetId === image.assetId;

            return (
              <div key={image.assetId} className="min-w-0 space-y-2">
                <button
                  type="button"
                  aria-label={`Select image ${image.assetId}`}
                  aria-pressed={selected}
                  disabled={disabled || !image.previewUrl || !workspaceId}
                  onClick={() => onSelect(image.assetId)}
                  className={[
                    "relative block aspect-square w-full",
                    "overflow-hidden rounded-xl border-2",
                    "bg-slate-50 transition",
                    "focus-visible:outline",
                    "focus-visible:outline-2",
                    "focus-visible:outline-violet-600",
                    "disabled:cursor-not-allowed",
                    "disabled:opacity-60",
                    selected
                      ? "border-violet-600"
                      : "border-slate-200 hover:border-violet-300",
                  ].join(" ")}
                >
                  {image.previewUrl ? (
                    <img
                      src={image.previewUrl}
                      alt="Generated workspace image"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                      onError={() => {
                        setImages((current) =>
                          current.map((item) =>
                            item.assetId === image.assetId
                              ? {
                                  ...item,
                                  previewUrl: null,
                                }
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

                {scope === "all" && (
                  <p
                    className="truncate text-xs font-medium text-slate-600"
                    title={image.sourceWorkspaceName}
                  >
                    {image.sourceWorkspaceName}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs leading-5 text-slate-500">
        Showing up to 12 recent ready images. Each image remains in its original
        workspace. Selecting an image does not consume AI credits.
      </p>
    </section>
  );
}
