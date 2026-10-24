import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Platform = "facebook" | "instagram" | "linkedin";
type PostMode = "draft" | "scheduled";

type CreateDraftFormProps = {
  caption: string;
  selectedPlatforms: Platform[];
  savingPost: boolean;
  postError: string;
  postMode: PostMode;
  scheduledAt: string;
  minScheduledAt: string;
  onCaptionChange: (value: string) => void;
  onPlatformsChange: (platforms: Platform[]) => void;
  onPostModeChange: (mode: PostMode) => void;
  onScheduledAtChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  linkedInConnectionId: string | null;
  linkedInDisplayName: string | null;
  linkedInStatus: string;
};

export function CreateDraftForm({
  caption,
  selectedPlatforms,
  savingPost,
  postError,
  postMode,
  scheduledAt,
  minScheduledAt,

  linkedInConnectionId,
  linkedInDisplayName,
  linkedInStatus,

  onCaptionChange,
  onPlatformsChange,
  onPostModeChange,
  onScheduledAtChange,
  onSave,
  onCancel,
}: CreateDraftFormProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-post-title"
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2
              id="create-post-title"
              className="text-xl font-bold text-slate-950"
            >
              Create a post
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Create a draft or schedule it for later.
            </p>
          </div>

          <button
            type="button"
            aria-label="Close dialog"
            onClick={onCancel}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X size={19} />
          </button>
        </div>

        <div className="mb-5">
          <span className="mb-2 block text-sm font-semibold text-slate-700">
            When should this post be saved?
          </span>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={postMode === "draft"}
              onClick={() => onPostModeChange("draft")}
              className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${
                postMode === "draft"
                  ? "border-violet-300 bg-violet-50 text-violet-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              Save as draft
            </button>

            <button
              type="button"
              aria-pressed={postMode === "scheduled"}
              onClick={() => onPostModeChange("scheduled")}
              className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${
                postMode === "scheduled"
                  ? "border-violet-300 bg-violet-50 text-violet-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              Schedule post
            </button>
          </div>
        </div>

        {postMode === "scheduled" && (
          <div className="mb-5">
            <label
              htmlFor="post-scheduled-at"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              Publish date and time
            </label>

            <input
              id="post-scheduled-at"
              type="datetime-local"
              value={scheduledAt}
              min={minScheduledAt}
              onChange={(event) => onScheduledAtChange(event.target.value)}
              className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
              required
            />

            <p className="mt-1 text-xs text-slate-500">
              Choose a future time in your local timezone.
            </p>
          </div>
        )}

        <label
          htmlFor="post-caption"
          className="mb-2 block text-sm font-semibold text-slate-700"
        >
          Caption
        </label>

        <textarea
          id="post-caption"
          rows={5}
          value={caption}
          onChange={(event) => onCaptionChange(event.target.value)}
          placeholder="What would you like to share with your audience?"
          className="w-full resize-y rounded-xl border border-slate-200 p-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
        />

        <fieldset className="mt-5">
          <legend className="mb-3 block text-sm font-semibold text-slate-700">
            Publishing platforms
          </legend>

          <div className="flex flex-wrap gap-4">
            {(
              [
                ["facebook", "Facebook"],
                ["instagram", "Instagram"],
                ["linkedin", "LinkedIn"],
              ] as const
            ).map(([platform, label]) => (
              <label
                key={platform}
                className="flex items-center gap-2 text-sm text-slate-600"
              >
                <input
                  type="checkbox"
                  checked={selectedPlatforms.includes(platform)}
                  disabled={savingPost}
                  onChange={(event) => {
                    onPlatformsChange(
                      event.target.checked
                        ? [...selectedPlatforms, platform]
                        : selectedPlatforms.filter((item) => item !== platform),
                    );
                  }}
                  className="h-4 w-4 rounded border-slate-300 accent-violet-600"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        {postError && (
          <p role="alert" className="mt-2 text-sm text-rose-600">
            {postError}
          </p>
        )}

        {/* LinkedIn account information */}
        {selectedPlatforms.includes("linkedin") && (
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium text-slate-700">
              Connected LinkedIn account
            </p>

            {linkedInStatus === "connected" && linkedInConnectionId ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-800">
                  {linkedInDisplayName || "LinkedIn account"}
                </p>

                <p className="mt-1 text-xs text-emerald-700">
                  Connected account selected for this post.
                </p>
              </div>
            ) : (
              <div
                role="status"
                className="rounded-xl border border-amber-200 bg-amber-50 p-4"
              >
                <p className="text-sm font-semibold text-amber-800">
                  No connected LinkedIn account
                </p>

                <p className="mt-1 text-xs text-amber-700">
                  Connect LinkedIn before scheduling this post. You can still
                  save it as a draft.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-400">
            {caption.length} characters
          </span>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="rounded-xl border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </Button>

            <Button
              type="button"
              disabled={savingPost}
              onClick={onSave}
              className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {savingPost
                ? "Saving..."
                : postMode === "scheduled"
                  ? "Schedule post"
                  : "Save draft"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
