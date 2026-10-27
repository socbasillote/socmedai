import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { PostEditorPage } from "@/components/PostEditorPage";
import { PostEditorForm } from "@/components/PostEditorForm";
import { PostPreview } from "@/components/PostPreview";

import { useWorkspaces } from "@/hooks/useWorkspaces";
import { useLinkedInConnection } from "@/hooks/useLinkedInConnection";

import {
  createPost,
  getPostById,
  publishPostNow,
  updateDraftPost,
  type PostPlatform,
} from "@/lib/posts";

type PostMode = "draft" | "scheduled" | "immediate";

type PostEditorRouteProps = {
  mode: "create" | "edit";
  postId?: string;
};

function getLocalDateTime(): string {
  const now = new Date();

  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());

  return now.toISOString().slice(0, 16);
}

export function PostEditorRoute({ mode, postId }: PostEditorRouteProps) {
  const navigate = useNavigate();

  const { workspaces, selectedWorkspaceId, workspacesLoading, workspaceError } =
    useWorkspaces();

  const selectedWorkspace = workspaces.find(
    (workspace) => workspace._id === selectedWorkspaceId,
  );
  const {
    status: linkedInStatus,
    displayName: linkedInDisplayName,
    connectionId: linkedInConnectionId,
    statusError: linkedInStatusError,
  } = useLinkedInConnection(selectedWorkspaceId, () => {});

  // Editor content
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");

  // Publishing platforms
  const [selectedPlatforms, setSelectedPlatforms] = useState<PostPlatform[]>([
    "facebook",
  ]);

  // Publishing options
  const [postMode, setPostMode] = useState<PostMode>("draft");
  const [scheduledAt, setScheduledAt] = useState("");

  // Existing post loading
  const [loadingPost, setLoadingPost] = useState(mode === "edit");
  const [loadError, setLoadError] = useState("");

  // Save state (API integration comes later)
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showPublishConfirmation, setShowPublishConfirmation] = useState(false);

  const publishingLockRef = useRef(false);

  const [publishing, setPublishing] = useState(false);

  const [publishingMessage, setPublishingMessage] = useState("");

  const [publishingOutcome, setPublishingOutcome] = useState<
    "published" | "failed" | "unknown" | null
  >(null);

  const [savedPublishingPostId, setSavedPublishingPostId] = useState<
    string | null
  >(null);

  const minScheduledAt = getLocalDateTime();

  const [existingDraftHasMedia, setExistingDraftHasMedia] = useState(false);

  useEffect(() => {
    if (mode !== "edit") {
      return;
    }

    if (!postId) {
      return;
    }

    let cancelled = false;

    async function loadPost() {
      setLoadingPost(true);
      setLoadError("");

      try {
        const post = await getPostById(postId!);

        if (cancelled) {
          return;
        }

        if (post.status !== "draft") {
          setLoadError("Only draft posts can be edited at this time.");
          return;
        }

        setTitle(post.title ?? "");
        setCaption(post.caption);
        setSelectedPlatforms(post.platforms);

        // Track whether the existing draft contains media.
        // Immediate LinkedIn publishing currently supports text-only posts.
        setExistingDraftHasMedia((post.mediaIds?.length ?? 0) > 0);

        // Draft editing currently supports draft mode only.
        setPostMode("draft");
        setScheduledAt("");
      } catch (err) {
        if (cancelled) {
          return;
        }

        setLoadError(
          err instanceof Error ? err.message : "Failed to load the post.",
        );
      } finally {
        if (!cancelled) {
          setLoadingPost(false);
        }
      }
    }

    void loadPost();

    return () => {
      cancelled = true;
    };
  }, [mode, postId]);

  async function handleSave() {
    if (saving || showPublishConfirmation) {
      return;
    }

    if (postMode === "immediate") {
      handlePublishReview();
      return;
    }

    const trimmedTitle = title.trim();
    const trimmedCaption = caption.trim();

    if (!trimmedCaption) {
      setError("Caption is required.");
      return;
    }

    if (selectedPlatforms.length === 0) {
      setError("Select at least one publishing platform.");
      return;
    }

    if (mode === "create") {
      if (workspacesLoading) {
        setError("Please wait while your workspace loads.");
        return;
      }

      if (workspaceError) {
        setError("Unable to verify the active workspace.");
        return;
      }

      if (!selectedWorkspace) {
        setError("Select or create a workspace before creating a post.");
        return;
      }

      let scheduledAtIso: string | undefined;

      if (postMode === "scheduled") {
        if (!scheduledAt) {
          setError("Select a date and time for your scheduled post.");
          return;
        }

        const scheduledDate = new Date(scheduledAt);

        if (Number.isNaN(scheduledDate.getTime())) {
          setError("Enter a valid scheduling date and time.");
          return;
        }

        if (scheduledDate.getTime() <= Date.now()) {
          setError("Scheduled time must be in the future.");
          return;
        }

        scheduledAtIso = scheduledDate.toISOString();
      }

      // LinkedIn requires a connected account.
      if (
        selectedPlatforms.includes("linkedin") &&
        (linkedInStatus !== "connected" || !linkedInConnectionId)
      ) {
        setError("Connect a LinkedIn account before selecting LinkedIn.");
        return;
      }

      setSaving(true);
      setError("");

      try {
        await createPost({
          workspaceId: selectedWorkspace._id,
          title: trimmedTitle,
          caption: trimmedCaption,
          platforms: selectedPlatforms,
          scheduledAt: scheduledAtIso,
          platformConnections: selectedPlatforms.includes("linkedin")
            ? { linkedin: linkedInConnectionId }
            : undefined,
        });

        navigate("/posts");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create the draft.",
        );
      } finally {
        setSaving(false);
      }

      return;
    }

    // Existing draft editing remains unchanged.
    if (!postId) {
      setError("Post ID is missing.");
      return;
    }

    if (postMode !== "draft") {
      setError(
        "Scheduling an existing draft is not supported yet. Select Save as Draft.",
      );
      return;
    }

    setSaving(true);
    setError("");

    try {
      await updateDraftPost(postId, {
        title: trimmedTitle,
        caption: trimmedCaption,
        platforms: selectedPlatforms,
      });

      navigate("/posts");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update the draft.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmPublish() {
    if (publishingLockRef.current || publishing || saving) {
      return;
    }

    // Never submit another publishing attempt for a draft
    // already created by this workflow.
    if (savedPublishingPostId) {
      setShowPublishConfirmation(false);

      setPublishingOutcome("unknown");

      setPublishingMessage(
        "A publishing attempt has already been started for this post. " +
          "Open your Posts page and check LinkedIn before taking further action.",
      );

      return;
    }

    // Revalidate the publishing requirements at confirmation time.
    if (
      (mode === "edit" && (!postId || existingDraftHasMedia)) ||
      !selectedWorkspace ||
      !caption.trim() ||
      selectedPlatforms.length !== 1 ||
      selectedPlatforms[0] !== "linkedin" ||
      linkedInStatus !== "connected" ||
      !linkedInConnectionId
    ) {
      setShowPublishConfirmation(false);

      setError(
        "Publishing requirements changed. Review your workspace, " +
          "caption, selected platform, and LinkedIn connection.",
      );

      return;
    }

    // Synchronous lock prevents repeated clicks before React
    // has rendered the disabled button.
    publishingLockRef.current = true;

    setPublishing(true);
    setSaving(true);
    setError("");
    setPublishingMessage("");
    setPublishingOutcome(null);

    let savedPostId: string | null = null;
    let publishRequestStarted = false;

    try {
      // Phase 1: Save the post before publishing.
      let targetPostId: string;

      if (mode === "edit") {
        if (!postId) {
          throw new Error("Post ID is missing.");
        }

        if (!linkedInConnectionId) {
          throw new Error("A connected LinkedIn account is required.");
        }

        // Update the original draft and associate the selected
        // LinkedIn account before publishing.
        await updateDraftPost(postId, {
          title: title.trim(),
          caption: caption.trim(),
          platforms: ["linkedin"],
          platformConnections: {
            linkedin: linkedInConnectionId,
          },
        });

        targetPostId = postId;
        savedPostId = targetPostId;
      } else {
        // New posts must first be persisted as drafts.
        const draft = await createPost({
          workspaceId: selectedWorkspace._id,
          title: title.trim(),
          caption: caption.trim(),
          platforms: ["linkedin"],
          mediaIds: [],
          platformConnections: {
            linkedin: linkedInConnectionId,
          },
        });

        targetPostId = draft._id;
        savedPostId = targetPostId;
      }

      // Prevent another attempt for this saved post.
      setSavedPublishingPostId(targetPostId);

      // Phase 2: Submit the saved draft for real publishing.
      publishRequestStarted = true;

      const response = await publishPostNow(targetPostId);

      const linkedInResult = response.result.results.find(
        (result) => result.platform === "linkedin",
      );

      const confirmedPublished =
        linkedInResult?.outcome === "published" &&
        response.post.status === "published";

      if (confirmedPublished) {
        setPublishingOutcome("published");

        setPublishingMessage(
          "Your post was successfully published to LinkedIn.",
        );

        setShowPublishConfirmation(false);

        return;
      }

      if (
        linkedInResult?.outcome === "failed" &&
        response.post.status === "failed"
      ) {
        setPublishingOutcome("failed");

        setPublishingMessage(
          linkedInResult.message ||
            response.post.lastError ||
            "LinkedIn publishing failed. Your post was saved in Storm.",
        );

        setShowPublishConfirmation(false);

        return;
      }

      // A response that is neither definitively published nor
      // definitively failed must be treated conservatively.
      setPublishingOutcome("unknown");

      setPublishingMessage(
        "Storm could not confirm whether LinkedIn published this post. " +
          "Check your LinkedIn account before taking further action.",
      );

      setShowPublishConfirmation(false);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "An unexpected error occurred.";

      if (publishRequestStarted) {
        // A network timeout or lost response does not prove that
        // LinkedIn rejected the post.
        setPublishingOutcome("unknown");

        setPublishingMessage(
          "Storm could not confirm the publishing outcome. " +
            "Check LinkedIn and your Posts page before taking further action. " +
            errorMessage,
        );
      } else if (savedPostId) {
        // The draft exists, but the publishing request was not sent.
        setPublishingOutcome("failed");

        setPublishingMessage(
          "The publishing request was not started. " +
            "Your existing or newly saved draft remains in Storm. " +
            errorMessage,
        );
      } else {
        // The draft save request did not complete successfully.
        // For existing drafts, a lost response may mean the
        // update succeeded even though the client cannot confirm it.
        setPublishingOutcome("failed");

        setPublishingMessage(
          mode === "edit"
            ? "Storm could not confirm that your draft changes were saved. " +
                "No LinkedIn publishing request was started by this workflow. " +
                "Check your draft in Posts before trying again. " +
                errorMessage
            : "Storm could not confirm that your draft was created. " +
                "No LinkedIn publishing request was started by this workflow. " +
                "Check your Posts page before trying again. " +
                errorMessage,
        );
      }

      setShowPublishConfirmation(false);
    } finally {
      setPublishing(false);
      setSaving(false);

      // Intentionally retain the lock after the publishing request
      // begins, even if the outcome is unknown.
      //
      // This prevents another submission from this editor session.
      if (!publishRequestStarted && !savedPostId) {
        publishingLockRef.current = false;
      }
    }
  }

  function handlePublishReview() {
    if (
      saving ||
      publishing ||
      publishingLockRef.current ||
      savedPublishingPostId ||
      showPublishConfirmation
    ) {
      if (savedPublishingPostId) {
        setError(
          "This post already has a saved publishing attempt. " +
            "Check your Posts page before taking further action.",
        );
      }

      return;
    }

    setError("");

    // Existing drafts must have a valid post ID.
    if (mode === "edit" && !postId) {
      setError("Post ID is missing.");
      return;
    }

    if (mode === "edit" && existingDraftHasMedia) {
      setError(
        "This draft contains media. Publish Now currently supports " +
          "LinkedIn text-only posts. Remove the media before publishing.",
      );

      return;
    }

    if (workspacesLoading) {
      setError("Please wait while your workspace loads.");
      return;
    }

    if (workspaceError || !selectedWorkspace) {
      setError("Select a valid workspace before publishing.");
      return;
    }

    if (!caption.trim()) {
      setError("Caption is required.");
      return;
    }

    if (selectedPlatforms.length !== 1 || selectedPlatforms[0] !== "linkedin") {
      setError("Publish Now currently supports LinkedIn only.");
      return;
    }

    if (linkedInStatus !== "connected" || !linkedInConnectionId) {
      setError("Connect a LinkedIn account before publishing.");
      return;
    }

    // Both new posts and existing drafts can now enter review.
    setShowPublishConfirmation(true);
  }

  function handleCancel() {
    if (publishing || saving) {
      return;
    }

    navigate("/posts");
  }

  const editorContent = loadingPost ? (
    <div
      role="status"
      className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center"
    >
      <p className="text-sm text-slate-600">Loading post...</p>
    </div>
  ) : loadError ? (
    <div
      role="alert"
      className="rounded-xl border border-rose-200 bg-rose-50 p-6"
    >
      <h2 className="font-semibold text-rose-800">Unable to edit post</h2>

      <p className="mt-2 text-sm text-rose-700">{loadError}</p>

      <button
        type="button"
        onClick={handleCancel}
        className="mt-4 rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm"
      >
        Back to Posts
      </button>
    </div>
  ) : (
    <PostEditorForm
      mode={mode}
      locked={savedPublishingPostId !== null}
      title={title}
      caption={caption}
      selectedPlatforms={selectedPlatforms}
      postMode={postMode}
      scheduledAt={scheduledAt}
      minScheduledAt={minScheduledAt}
      saving={saving || publishing}
      error={error}
      linkedInConnectionId={
        linkedInStatus === "connected" ? linkedInConnectionId || null : null
      }
      linkedInDisplayName={linkedInDisplayName || null}
      linkedInStatus={linkedInStatus}
      onTitleChange={(value) => {
        setTitle(value);
        setError("");
      }}
      onCaptionChange={(value) => {
        setCaption(value);
        setError("");
      }}
      onPlatformsChange={(platforms) => {
        setSelectedPlatforms(platforms);
        setError("");
      }}
      onPostModeChange={(value) => {
        setPostMode(value);
        setError("");
      }}
      onScheduledAtChange={(value) => {
        setScheduledAt(value);
        setError("");
      }}
      onSave={handleSave}
      onCancel={handleCancel}
    />
  );

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <PostEditorPage
          mode={mode}
          onBack={handleCancel}
          preview={
            !loadingPost && !loadError ? (
              <PostPreview
                title={title}
                caption={caption}
                platforms={selectedPlatforms}
              />
            ) : undefined
          }
        >
          <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Active Workspace
            </p>

            {workspacesLoading ? (
              <p className="mt-2 text-sm text-slate-600">
                Loading workspace...
              </p>
            ) : workspaceError ? (
              <p role="alert" className="mt-2 text-sm text-rose-600">
                {workspaceError}
              </p>
            ) : selectedWorkspace ? (
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {selectedWorkspace.name}
              </p>
            ) : (
              <p className="mt-2 text-sm text-amber-700">
                No workspace available. Create a workspace before creating
                posts.
              </p>
            )}
          </div>
          {linkedInStatusError && (
            <div
              role="alert"
              className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4"
            >
              <p className="text-sm text-rose-700">
                LinkedIn: {linkedInStatusError}
              </p>
            </div>
          )}

          {publishing && (
            <div
              role="status"
              aria-live="polite"
              className="mb-6 rounded-xl border border-violet-200 bg-violet-50 p-4"
            >
              <div className="flex items-center gap-3">
                <div
                  aria-hidden="true"
                  className="h-5 w-5 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600"
                />

                <div>
                  <p className="text-sm font-semibold text-violet-900">
                    Publishing to LinkedIn...
                  </p>

                  <p className="mt-1 text-xs text-violet-700">
                    Please keep this page open while Storm submits your post. Do
                    not refresh or submit another publishing request.
                  </p>
                </div>
              </div>
            </div>
          )}

          {publishingMessage && (
            <div
              role="status"
              className={`mb-6 rounded-xl border p-4 ${
                publishingOutcome === "published"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : publishingOutcome === "failed"
                    ? "border-rose-200 bg-rose-50 text-rose-800"
                    : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              <p className="text-sm font-semibold">
                {publishingOutcome === "published"
                  ? "Published Successfully"
                  : publishingOutcome === "failed"
                    ? "Publishing Failed"
                    : "Publishing Status Unknown"}
              </p>

              <p className="mt-2 text-sm">{publishingMessage}</p>

              {savedPublishingPostId && (
                <button
                  type="button"
                  onClick={() => navigate("/posts")}
                  className="mt-4 rounded-lg border border-current px-4 py-2 text-sm font-semibold"
                >
                  View Posts
                </button>
              )}
            </div>
          )}
          {editorContent}
        </PostEditorPage>
      </div>

      {showPublishConfirmation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="publish-confirmation-title"
            aria-describedby="publish-confirmation-description"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
          >
            <h2
              id="publish-confirmation-title"
              className="text-xl font-bold text-slate-900"
            >
              Publish to LinkedIn?
            </h2>

            <p
              id="publish-confirmation-description"
              className="mt-3 text-sm leading-6 text-slate-600"
            >
              This will immediately publish your post to your connected LinkedIn
              account.
            </p>

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Publishing Account
              </p>

              <p className="mt-2 text-sm font-semibold text-slate-900">
                {linkedInDisplayName || "Connected LinkedIn account"}
              </p>

              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Post Preview
              </p>

              <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-sm text-slate-700">
                {caption.trim()}
              </p>
            </div>

            <p className="mt-4 text-xs leading-5 text-amber-700">
              Once published, this post may be visible to other LinkedIn users.
              Publishing cannot be undone from Storm.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowPublishConfirmation(false)}
                disabled={publishing || saving}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  void handleConfirmPublish();
                }}
                disabled={publishing || saving}
                className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {publishing ? "Publishing..." : "Confirm Publish"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
