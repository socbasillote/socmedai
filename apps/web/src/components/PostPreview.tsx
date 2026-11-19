import { SelectedMediaPreview } from "@/features/publishing/components/SelectedMediaPreview";

import type { PostPlatform } from "@/lib/posts";

type PostPreviewProps = {
  title: string;
  selectedMediaAssetId?: string | null;
  accountName?: string;
  caption: string;
  platforms: PostPlatform[];
  media?: {
    id: string;
    type: "image" | "video";
    url: string;
  }[];
};

export function PostPreview({
  caption,
  selectedMediaAssetId,
  accountName = "Your social account",
  platforms,
  media = [],
}: PostPreviewProps) {
  return (
    <div className="space-y-5">
      {/* Platform indicators */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Selected Platforms
        </p>

        <div className="flex flex-wrap gap-2">
          {platforms.length > 0 ? (
            platforms.map((platform) => (
              <span
                key={platform}
                className="rounded-full bg-violet-50 px-2 py-1 text-xs font-semibold capitalize text-violet-700"
              >
                {platform}
              </span>
            ))
          ) : (
            <span className="text-sm text-slate-400">
              No platforms selected
            </span>
          )}
        </div>
      </div>

      {/* Post card */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {/* Preview header */}
        <div className="flex items-center gap-3 border-b border-slate-100 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-violet-700">
            S
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">
              {accountName}
            </p>

            <p className="text-xs text-slate-400">Post preview</p>
          </div>
        </div>

        {/* Caption */}
        <div className="space-y-3 p-4">
          <p className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
            {caption.trim() ||
              "Your post caption will appear here as you type."}
          </p>
        </div>

        {/* Media */}
        {selectedMediaAssetId ? (
          <div className="border-t border-slate-100 bg-slate-50 p-3">
            <SelectedMediaPreview
              key={selectedMediaAssetId}
              assetId={selectedMediaAssetId}
              variant="post"
            />
          </div>
        ) : media.length > 0 ? (
          <div className="space-y-3 border-t border-slate-100 p-4">
            {media.map((item) => (
              <div key={item.id}>
                {item.type === "image" ? (
                  <img
                    src={item.url}
                    alt="Post attachment preview"
                    className="max-h-80 w-full rounded-lg object-contain"
                  />
                ) : (
                  <video
                    src={item.url}
                    controls
                    preload="metadata"
                    className="max-h-80 w-full rounded-lg"
                  />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-400">
            Text-only post
          </div>
        )}
      </div>

      <p className="text-[11px] leading-5 text-slate-400">
        This is a general content preview. Actual appearance may differ across
        social platforms.
      </p>
    </div>
  );
}
