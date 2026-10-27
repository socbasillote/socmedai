import type { FormEvent } from "react";
import { ImagePlus, Video } from "lucide-react";

import type { PostPlatform } from "@/lib/posts";

type PostMode = "draft" | "scheduled" | "immediate";

type PostEditorFormProps = {
  mode: "create" | "edit";

  title: string;
  caption: string;
  selectedPlatforms: PostPlatform[];

  postMode: PostMode;
  scheduledAt: string;
  minScheduledAt: string;

  saving: boolean;
  error: string;

  linkedInConnectionId: string | null;
  linkedInDisplayName: string | null;
  linkedInStatus: string;

  onTitleChange: (value: string) => void;
  onCaptionChange: (value: string) => void;
  onPlatformsChange: (platforms: PostPlatform[]) => void;

  onPostModeChange: (mode: PostMode) => void;
  onScheduledAtChange: (value: string) => void;

  onSave: () => void | Promise<void>;
  onCancel: () => void;

  locked?: boolean;
};

const platforms: {
  id: PostPlatform;
  label: string;
}[] = [
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "linkedin", label: "LinkedIn" },
];

export function PostEditorForm({
  mode,
  title,
  caption,
  locked = false,
  selectedPlatforms,
  postMode,
  scheduledAt,
  minScheduledAt,
  saving,
  error,
  linkedInConnectionId,
  linkedInDisplayName,
  linkedInStatus,
  onTitleChange,
  onCaptionChange,
  onPlatformsChange,
  onPostModeChange,
  onScheduledAtChange,
  onSave,
  onCancel,
}: PostEditorFormProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving || locked) return;

    void onSave();
  }

  function togglePlatform(platform: PostPlatform) {
    if (selectedPlatforms.includes(platform)) {
      onPlatformsChange(selectedPlatforms.filter((item) => item !== platform));
    } else {
      onPlatformsChange([...selectedPlatforms, platform]);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {/* Title */}
      <div>
        <label
          htmlFor="editor-title"
          className="mb-2 block text-sm font-semibold text-slate-700"
        >
          Post Title
        </label>

        <input
          id="editor-title"
          type="text"
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="Enter a title (optional)"
          disabled={saving || locked}
          className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
        />
      </div>

      {/* Caption */}
      <div>
        <label
          htmlFor="editor-caption"
          className="mb-2 block text-sm font-semibold text-slate-700"
        >
          Caption
        </label>

        <textarea
          id="editor-caption"
          rows={8}
          value={caption}
          onChange={(event) => onCaptionChange(event.target.value)}
          placeholder="What would you like to share?"
          disabled={saving || locked}
          required
          className="w-full resize-y rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
        />

        <p className="mt-2 text-right text-xs text-slate-400">
          {caption.length} characters
        </p>
      </div>

      {/* Media placeholder */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Media</h3>

        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
          <div className="mb-3 flex justify-center gap-3 text-slate-400">
            <ImagePlus size={24} />
            <Video size={24} />
          </div>

          <p className="text-sm font-medium text-slate-700">
            Images and videos
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Media uploads will be available in an upcoming step.
          </p>
        </div>
      </section>

      {/* Platforms */}
      <fieldset disabled={saving || locked}>
        <legend className="mb-3 text-sm font-semibold text-slate-700">
          Publishing Platforms
        </legend>

        <div className="flex flex-wrap gap-4">
          {platforms.map((platform) => (
            <label
              key={platform.id}
              className="flex items-center gap-2 text-sm text-slate-600"
            >
              <input
                type="checkbox"
                checked={selectedPlatforms.includes(platform.id)}
                onChange={() => togglePlatform(platform.id)}
                className="h-4 w-4 accent-violet-600"
              />

              {platform.label}
            </label>
          ))}
        </div>
      </fieldset>

      {/* LinkedIn connection */}
      {selectedPlatforms.includes("linkedin") && (
        <section className="rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-700">
            LinkedIn Account
          </h3>

          {linkedInStatus === "connected" && linkedInConnectionId ? (
            <p className="mt-2 text-sm text-emerald-700">
              Connected: {linkedInDisplayName || "LinkedIn account"}
            </p>
          ) : (
            <p className="mt-2 text-sm text-amber-700">
              No connected LinkedIn account. Connect LinkedIn before scheduling
              this post. You can still save a draft.
            </p>
          )}
        </section>
      )}

      {/* Publishing mode */}
      <fieldset disabled={saving || locked}>
        <legend className="mb-3 text-sm font-semibold text-slate-700">
          Publishing Options
        </legend>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            type="button"
            aria-pressed={postMode === "draft"}
            onClick={() => onPostModeChange("draft")}
            className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
              postMode === "draft"
                ? "border-violet-300 bg-violet-50 text-violet-700"
                : "border-slate-200 text-slate-600"
            }`}
          >
            Save as Draft
          </button>

          <button
            type="button"
            aria-pressed={postMode === "scheduled"}
            onClick={() => onPostModeChange("scheduled")}
            title={
              mode === "edit"
                ? "Scheduling existing drafts is not available yet."
                : undefined
            }
            className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
              postMode === "scheduled"
                ? "border-violet-300 bg-violet-50 text-violet-700"
                : "border-slate-200 text-slate-600"
            }`}
          >
            Schedule Post
          </button>

          <button
            type="button"
            aria-pressed={postMode === "immediate"}
            onClick={() => onPostModeChange("immediate")}
            title="Publish immediately to your connected LinkedIn account."
            className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${
              postMode === "immediate"
                ? "border-violet-300 bg-violet-50 text-violet-700"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            Publish Now
          </button>
        </div>
      </fieldset>

      {/* Schedule date */}
      {postMode === "scheduled" && (
        <div>
          <label
            htmlFor="editor-scheduled-at"
            className="mb-2 block text-sm font-semibold text-slate-700"
          >
            Publish Date and Time
          </label>

          <input
            id="editor-scheduled-at"
            type="datetime-local"
            value={scheduledAt}
            min={minScheduledAt}
            onChange={(event) => onScheduledAtChange(event.target.value)}
            disabled={saving || locked}
            required
            className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
          />

          <p className="mt-2 text-xs text-slate-500">
            Times are entered in your local timezone.
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving || locked}
          className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={saving || locked}
          className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {saving
            ? postMode === "immediate"
              ? "Publishing..."
              : "Saving..."
            : locked
              ? "Publishing Attempt Completed"
              : postMode === "immediate"
                ? "Review & Publish"
                : mode === "edit"
                  ? "Save Changes"
                  : postMode === "scheduled"
                    ? "Schedule Post"
                    : "Save Draft"}
        </button>
      </div>
    </form>
  );
}
