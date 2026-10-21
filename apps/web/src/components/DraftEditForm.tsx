import type { FormEvent } from "react";

export type Platform = "facebook" | "instagram" | "linkedin";

type DraftEditFormProps = {
  title: string;
  caption: string;
  platforms: Platform[];
  saving: boolean;
  error: string;
  onTitleChange: (value: string) => void;
  onCaptionChange: (value: string) => void;
  onPlatformsChange: (platforms: Platform[]) => void;
  onSave: () => void;
  onCancel: () => void;
};

export function DraftEditForm({
  title,
  caption,
  platforms,
  saving,
  error,
  onTitleChange,
  onCaptionChange,
  onPlatformsChange,
  onSave,
  onCancel,
}: DraftEditFormProps) {
  const availablePlatforms: { id: Platform; label: string }[] = [
    { id: "facebook", label: "Facebook" },
    { id: "instagram", label: "Instagram" },
    { id: "linkedin", label: "LinkedIn" },
  ];

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave();
  }

  return (
    <div className="border-t border-slate-100 bg-slate-50/70 p-5 sm:p-6">
      <form onSubmit={handleSubmit} className="mx-auto max-w-3xl space-y-5">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Edit draft</h3>
          <p className="mt-1 text-sm text-slate-500">
            Update the title, caption, and publishing platforms.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
          >
            {error}
          </div>
        )}

        <div className="space-y-2">
          <label
            htmlFor="edit-post-title"
            className="block text-sm font-medium text-slate-700"
          >
            Title (optional)
          </label>
          <input
            id="edit-post-title"
            type="text"
            maxLength={150}
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            disabled={saving}
            placeholder="Give your draft a title"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:opacity-60"
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="edit-post-caption"
            className="block text-sm font-medium text-slate-700"
          >
            Caption
          </label>
          <textarea
            id="edit-post-caption"
            value={caption}
            onChange={(event) => onCaptionChange(event.target.value)}
            disabled={saving}
            required
            maxLength={10000}
            rows={5}
            placeholder="Write your post caption..."
            className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:opacity-60"
          />
          <p className="text-right text-xs text-slate-400">
            {caption.length}/10000
          </p>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-slate-700">
            Publishing platforms
          </legend>

          <div className="flex flex-wrap gap-4">
            {availablePlatforms.map(({ id, label }) => (
              <label
                key={id}
                className="flex items-center gap-2 text-sm text-slate-600"
              >
                <input
                  type="checkbox"
                  checked={platforms.includes(id)}
                  disabled={saving}
                  onChange={(event) => {
                    onPlatformsChange(
                      event.target.checked
                        ? [...platforms, id]
                        : platforms.filter((platform) => platform !== id),
                    );
                  }}
                  className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={onCancel}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
