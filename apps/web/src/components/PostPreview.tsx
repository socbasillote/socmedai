import { ImagePlus, Video } from "lucide-react";

import type { PostPlatform } from "@/lib/posts";

type PostPreviewProps = {
  title: string;
  caption: string;
  platforms: PostPlatform[];
  media?: {
    id: string;
    type: "image" | "video";
    url: string;
  }[];
};

export function PostPreview({
  title,
  caption,
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
                className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold capitalize text-violet-700"
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
              Social Account
            </p>

            <p className="text-xs text-slate-400">Post preview</p>
          </div>
        </div>

        {/* Caption */}
        <div className="space-y-3 p-4">
          {title.trim() && (
            <h3 className="break-words text-sm font-bold text-slate-900">
              {title}
            </h3>
          )}

          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
            {caption.trim() ||
              "Your post caption will appear here as you type."}
          </p>
        </div>

        {/* Media */}
        {media.length > 0 ? (
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
          <div className="flex aspect-video items-center justify-center border-t border-slate-100 bg-slate-50">
            <div className="text-center text-slate-400">
              <div className="mb-3 flex justify-center gap-3">
                <ImagePlus size={24} />
                <Video size={24} />
              </div>

              <p className="text-xs font-medium">
                No images or videos attached
              </p>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs leading-5 text-slate-400">
        This is a general content preview. Actual appearance may differ across
        social platforms.
      </p>
    </div>
  );
}
