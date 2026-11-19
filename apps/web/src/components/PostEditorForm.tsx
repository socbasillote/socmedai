import type { InstagramConnectionInfo } from "@/hooks/useInstagramConnections";
import { Check, ImagePlus, Send, PenLine } from "lucide-react";
import { PublishingCaptionGenerator } from "@/features/publishing/components/PublishingCaptionGenerator";
import { lazy, Suspense, useState, type FormEvent } from "react";
import type { PostPlatform } from "@/lib/posts";

import {
  FacebookPageConnectionSelect,
  type FacebookPageConnectionOption,
} from "@/components/FacebookPageConnectionSelect";

import { MediaLibraryPicker } from "@/features/publishing/components/MediaLibraryPicker";
import { SelectedMediaPreview } from "@/features/publishing/components/SelectedMediaPreview";
const PublishingImageGenerator = lazy(() =>
  import("@/features/publishing/components/PublishingImageGenerator").then(
    (module) => ({ default: module.PublishingImageGenerator }),
  ),
);

type PostMode = "draft" | "scheduled" | "immediate";

type PostEditorFormProps = {
  mode: "create" | "edit";

  recoveryOwnerUserId: string | null;
  captionSessionKey?: string;

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

  instagramConnections?: InstagramConnectionInfo[];
  selectedInstagramConnectionId?: string | null;
  instagramLoading?: boolean;
  instagramError?: string;
  onInstagramConnectionChange?: (id: string | null) => void;
  onConnectInstagram?: (facebookConnectionId: string) => void;

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
  mode,
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
  instagramConnections = [],
  selectedInstagramConnectionId = null,
  instagramLoading = false,
  instagramError = "",
  onInstagramConnectionChange,
  onConnectInstagram,
  onTitleChange,
  onCaptionChange,
  onPlatformsChange,
  onSave,
  workspaceId,
  selectedMediaAssetId,
  onMediaSelect,
  onMediaRemove,
  recoveryOwnerUserId,
  captionSessionKey = mode,
}: PostEditorFormProps) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [generatorOpen, setGeneratorOpen] = useState(false);

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
      <section
        aria-labelledby="editor-destinations-heading"
        className="space-y-4 border-b border-slate-100 pb-6"
      >
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
            <Send size={17} aria-hidden="true" />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-500">
              Step 1
            </p>
            <h2
              id="editor-destinations-heading"
              className="text-base font-bold text-slate-900"
            >
              Choose your destination
            </h2>
          </div>
        </div>
        {/* Platforms */}
        <fieldset disabled={saving || locked}>
          <legend className="mb-3 text-sm font-semibold text-slate-700">
            Publishing Platforms
          </legend>

          <div className="grid gap-2 sm:grid-cols-3">
            {platforms.map((platform) => (
              <label
                key={platform.id}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition focus-within:ring-2 focus-within:ring-violet-300 ${selectedPlatforms.includes(platform.id) ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-600 hover:border-violet-200"}`}
              >
                <input
                  type="checkbox"
                  aria-label={platform.label}
                  checked={selectedPlatforms.includes(platform.id)}
                  onChange={() => togglePlatform(platform.id)}
                  className="h-4 w-4 accent-violet-600"
                />

                <span className="flex-1 font-semibold">
                  {platform.label}
                  <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                    {platform.id === "instagram"
                      ? "One image + caption"
                      : "Caption + image"}
                  </span>
                </span>
                {selectedPlatforms.includes(platform.id) && (
                  <Check size={15} aria-hidden="true" />
                )}
              </label>
            ))}
          </div>
        </fieldset>

        <p className="text-xs leading-5 text-slate-500">
          Choose one destination to publish now or schedule. You can save
          multiple platforms in a draft.
        </p>
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
              Choose the Facebook Page where you want to publish this post.
            </p>
          </section>
        )}

        {selectedPlatforms.includes("instagram") && (
          <section className="space-y-3 rounded-xl border border-slate-200 p-4">
            <label className="block text-sm font-semibold">
              Instagram account
              <select
                aria-label="Instagram account"
                value={selectedInstagramConnectionId ?? ""}
                disabled={saving || locked || instagramLoading}
                onChange={(event) =>
                  onInstagramConnectionChange?.(event.target.value || null)
                }
                className="mt-2 w-full rounded-lg border p-2"
              >
                <option value="">Select an Instagram account</option>
                {instagramConnections
                  .filter((item) => item.status === "connected")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      @{item.username}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block text-sm">
              Connect or refresh Instagram through a Facebook Page
              <select
                aria-label="Connect Instagram through a Facebook Page"
                value=""
                disabled={
                  saving ||
                  locked ||
                  instagramLoading ||
                  facebookConnectionsLoading
                }
                onChange={(event) => {
                  if (event.target.value)
                    onConnectInstagram?.(event.target.value);
                }}
                className="mt-2 w-full rounded-lg border p-2"
              >
                <option value="">Choose a connected Page</option>
                {facebookConnections
                  .filter(
                    (item) => item.status === "connected" && item.canPublish,
                  )
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.pageName}
                    </option>
                  ))}
              </select>
            </label>
            <p className="text-xs text-slate-500">
              Use a professional Instagram account linked to a Facebook Page.
              Connect or reconnect Facebook in your social accounts to grant
              Instagram permissions. One image and a caption are required.
            </p>
            {instagramLoading && (
              <p role="status">Loading Instagram accounts...</p>
            )}
            {instagramError && (
              <p role="alert" className="text-sm text-rose-700">
                {instagramError}
              </p>
            )}
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
                Connect a LinkedIn account before publishing. You can still save
                a draft.
              </p>
            )}
          </section>
        )}
      </section>
      <section
        aria-labelledby="editor-content-heading"
        className="space-y-4 border-b border-slate-100 pb-6"
      >
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
            <PenLine size={17} aria-hidden="true" />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-500">
              Step 2
            </p>
            <h2
              id="editor-content-heading"
              className="text-base font-bold text-slate-900"
            >
              Write your post
            </h2>
          </div>
        </div>
        {/* Title */}
        <div>
          <label
            htmlFor="editor-title"
            className="mb-2 block text-sm font-semibold text-slate-700"
          >
            Post Title{" "}
            <span className="ml-1 font-normal text-slate-400">optional</span>
          </label>

          <input
            id="editor-title"
            type="text"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="Give this post a name for your planner"
            aria-describedby="editor-title-help"
            disabled={saving || locked}
            className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
          />
        </div>

        <p id="editor-title-help" className="-mt-2 text-xs text-slate-500">
          This title stays in your planner and will not appear on social
          platforms.
        </p>
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
          <PublishingCaptionGenerator
            key={`${recoveryOwnerUserId}:${workspaceId}:${captionSessionKey}:${saving || locked}`}
            disabled={!workspaceId || !recoveryOwnerUserId || saving || locked}
            initialBrief={title}
            defaultPlatform={selectedPlatforms[0] ?? "facebook"}
            hasCaption={Boolean(caption.trim())}
            onApply={onCaptionChange}
          />
        </div>
      </section>
      {/* Media */}
      <section aria-label="Post media" className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
            <ImagePlus size={17} aria-hidden="true" />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-500">
              Step 3
            </p>
            <h2 className="text-base font-bold text-slate-900">
              Add an image{" "}
              <span className="text-xs font-normal text-slate-400">
                optional
              </span>
            </h2>
          </div>
        </div>

        {selectedMediaAssetId ? (
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
            <p className="text-sm font-semibold text-violet-900">
              Image selected
            </p>

            <div className="mt-3">
              <SelectedMediaPreview
                key={selectedMediaAssetId}
                assetId={selectedMediaAssetId}
              />
            </div>

            <p className="mt-3 text-xs text-violet-700">
              {mode === "edit"
                ? "This image is part of the draft's current selection. Save changes to persist replacements or removals."
                : "This image will be included when you save or publish."}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving || locked}
                onClick={() => {
                  setGeneratorOpen(false);
                  setLibraryOpen(true);
                }}
                className="rounded-lg border border-violet-300 bg-white px-2 py-2 text-xs font-normal text-violet-800 disabled:opacity-50"
              >
                Replace image
              </button>

              <button
                type="button"
                disabled={!workspaceId || saving || locked}
                onClick={() => {
                  setLibraryOpen(false);
                  setGeneratorOpen(true);
                }}
                className="rounded-lg border border-violet-300 bg-white px-2 py-2 text-xs font-normal text-violet-800 disabled:opacity-50"
              >
                Generate replacement
              </button>

              <button
                type="button"
                disabled={saving || locked}
                onClick={() => {
                  onMediaRemove();
                  setLibraryOpen(false);
                  setGeneratorOpen(false);
                }}
                className="rounded-lg border border-rose-200 bg-white px-2 py-2 text-xs font-normal text-rose-700 disabled:opacity-50"
              >
                Remove image
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
            <ImagePlus
              size={28}
              className="mx-auto mb-3 text-violet-400"
              aria-hidden="true"
            />
            <p className="text-sm font-normal text-slate-700">
              Bring your post to life
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Choose from your library or create something new with AI.
            </p>

            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                disabled={!workspaceId || saving || locked}
                onClick={() => {
                  setGeneratorOpen(false);
                  setLibraryOpen(true);
                }}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-normal text-white disabled:opacity-50"
              >
                Choose from Media Library
              </button>

              <button
                type="button"
                disabled={!workspaceId || saving || locked}
                onClick={() => {
                  setLibraryOpen(false);
                  setGeneratorOpen(true);
                }}
                className="rounded-lg border border-violet-300 bg-white px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50"
              >
                Generate with AI
              </button>
            </div>
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
                className="text-xs font-normal text-slate-600 underline"
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

        {generatorOpen && (
          <section
            aria-label="AI Image Generator"
            className="rounded-xl border border-violet-200 bg-white p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">
                  Generate an image with AI
                </h4>

                <p className="mt-1 text-xs leading-5 text-slate-600">
                  Create an image for this post using your workspace's AI
                  generation credits.
                </p>
              </div>

              <button
                type="button"
                disabled={saving || locked}
                onClick={() => setGeneratorOpen(false)}
                className="text-xs font-semibold text-slate-600 underline disabled:opacity-50"
              >
                Close generator
              </button>
            </div>

            <div className="mt-5">
              <Suspense
                fallback={<p role="status">Loading image generator...</p>}
              >
                <PublishingImageGenerator
                  key={`${recoveryOwnerUserId ?? "no-user"}:${workspaceId ?? "no-workspace"}`}
                  workspaceId={workspaceId}
                  ownerUserId={recoveryOwnerUserId}
                  disabled={saving || locked}
                  onUseImage={(assetId) => {
                    if (!workspaceId || saving || locked) {
                      return;
                    }

                    // Reuse the existing media-selection callback.
                    // Do not introduce another attachment state.
                    onMediaSelect(assetId);

                    // Return to the main editor so the user sees
                    // the selected-image preview.
                    setGeneratorOpen(false);
                    setLibraryOpen(false);
                  }}
                />
              </Suspense>
            </div>
          </section>
        )}

        <p className="text-xs leading-5 text-slate-500">
          Publish one image with your caption to Facebook or LinkedIn, or save
          it with a draft. Scheduled image publishing is not supported yet.
        </p>
      </section>

      {/* Error */}
      {error && (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      )}
    </form>
  );
}
