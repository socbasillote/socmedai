import { useState, type FormEvent } from "react";
import type { PostPlatform } from "@/lib/posts";

import {
  FacebookPageConnectionSelect,
  type FacebookPageConnectionOption,
} from "@/components/FacebookPageConnectionSelect";

import { MediaLibraryPicker } from "@/features/publishing/components/MediaLibraryPicker";

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

  facebookConnections: FacebookPageConnectionOption[];
  selectedFacebookConnectionId: string | null;
  facebookConnectionsLoading: boolean;
  facebookConnectionsError: string | null;
  onFacebookConnectionChange: (connectionId: string | null) => void;

  onTitleChange: (value: string) => void;
  onCaptionChange: (value: string) => void;
  onPlatformsChange: (platforms: PostPlatform[]) => void;

  onPostModeChange: (mode: PostMode) => void;
  onScheduledAtChange: (value: string) => void;

  onSave: () => void | Promise<void>;
  onCancel: () => void;

  locked?: boolean;

  workspaceId: string | null;
  selectedMediaAssetId: string | null;
  onMediaSelect: (assetId: string) => void;
  onMediaRemove: () => void;
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
  title,
  caption,
  locked = false,
  selectedPlatforms,

  saving,
  error,
  linkedInConnectionId,
  linkedInDisplayName,
  linkedInStatus,
  facebookConnections,
  selectedFacebookConnectionId,
  facebookConnectionsLoading,
  facebookConnectionsError,
  onFacebookConnectionChange,
  onTitleChange,
  onCaptionChange,
  onPlatformsChange,
  onSave,
  workspaceId,
  selectedMediaAssetId,
  onMediaSelect,
  onMediaRemove,
}: PostEditorFormProps) {
  const [libraryOpen, setLibraryOpen] = useState(false);

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
    <form
      id="storm-post-editor-form"
      onSubmit={handleSubmit}
      noValidate
      className="space-y-6"
    >
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
      <section aria-label="Post media" className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Media</h3>

          <p className="mt-1 text-xs text-slate-500">
            Choose an image generated in your workspace.
          </p>
        </div>

        {selectedMediaAssetId ? (
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
            <p className="text-sm font-semibold text-violet-900">
              Image selected
            </p>

            <p className="mt-1 text-xs text-violet-700">
              Your selected image is ready for attachment once media saving is
              enabled.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving || locked}
                onClick={() => setLibraryOpen(true)}
                className="rounded-lg border border-violet-300 bg-white px-3 py-2 text-xs font-medium text-violet-800 disabled:opacity-50"
              >
                Replace image
              </button>

              <button
                type="button"
                disabled={saving || locked}
                onClick={() => {
                  onMediaRemove();
                  setLibraryOpen(false);
                }}
                className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700 disabled:opacity-50"
              >
                Remove image
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
            <p className="text-sm font-medium text-slate-700">
              No image selected
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Select an existing AI-generated image.
            </p>

            <button
              type="button"
              disabled={!workspaceId || saving || locked}
              onClick={() => setLibraryOpen(true)}
              className="mt-4 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Choose from Media Library
            </button>
          </div>
        )}

        {libraryOpen && (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-slate-900">
                Choose an image
              </h4>

              <button
                type="button"
                disabled={saving || locked}
                onClick={() => setLibraryOpen(false)}
                className="text-xs font-medium text-slate-600 underline"
              >
                Close
              </button>
            </div>

            <MediaLibraryPicker
              key={workspaceId ?? "no-workspace"}
              workspaceId={workspaceId}
              selectedAssetId={selectedMediaAssetId}
              disabled={saving || locked}
              onSelect={(assetId) => {
                onMediaSelect(assetId);
                setLibraryOpen(false);
              }}
            />
          </div>
        )}

        <p className="text-xs leading-5 text-slate-500">
          Image selection is currently an editor-only preview. Post persistence
          will be connected after server-side media validation is added.
        </p>
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

      {/* Facebook Page selection */}
      {selectedPlatforms.includes("facebook") && (
        <section className="rounded-xl border border-slate-200 p-4">
          <FacebookPageConnectionSelect
            connections={facebookConnections}
            selectedConnectionId={selectedFacebookConnectionId}
            loading={facebookConnectionsLoading}
            disabled={saving || locked}
            error={facebookConnectionsError}
            onChange={onFacebookConnectionChange}
          />

          <p className="mt-3 text-xs text-slate-500">
            Facebook publishing is not enabled yet. You can select a Page and
            save this post as a draft.
          </p>
        </section>
      )}

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

      {/* Error */}
      {error && (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      )}
    </form>
  );
}
