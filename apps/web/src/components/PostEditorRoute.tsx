import { useComposerAutosave } from "@/features/posts/hooks/useComposerAutosave";
import { readWorkspacePreferences, nextPreferredSchedule, parseZonedInput, zonedInputValue, canApplyWorkspaceDefaults } from "@/lib/workspaceSettings";
import { useInstagramConnections } from "@/hooks/useInstagramConnections";
import { useEffect, useLayoutEffect, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "@/auth/useAuth";

import { getPlannerSchedulePrefill } from "@/features/content-planner/utils/plannerDatePrefill";

import { PostEditorPage } from "@/components/PostEditorPage";
import { PostEditorForm } from "@/components/PostEditorForm";
import { PostPreview } from "@/components/PostPreview";

import type { FacebookPageConnectionOption } from "@/components/FacebookPageConnectionSelect";

import { getFacebookPageConnections } from "@/lib/facebookConnections";

import { useWorkspaces } from "@/hooks/useWorkspaces";
import { useLinkedInConnection } from "@/hooks/useLinkedInConnection";

import {
  createPost,
  getPostById,
  publishPostNow,
  updateDraftPost,
  type PostPlatform,
} from "@/lib/posts";

import {
  toScheduledAtISOString,
} from "@/shared/utils/schedulingDate";

import { getPlannerReturnUrl } from "@/features/content-planner/utils/plannerNavigation";

import {
  addDestination,
  createPublishingDraft,
  setSharedCaption,
  setSharedMedia,
  type PublishingDestination,
} from "@/features/publishing/publishingDraft";

import {
  evaluatePublishingReadiness,
  type PublishingCapabilityContext,
} from "@/features/publishing/publishingReadiness";

import { PublishingChecklistPanel } from "@/features/publishing/components/PublishingChecklistPanel";

import { PublishingControls } from "@/features/publishing/components/PublishingControls";

import {
  createPostMediaState,
  selectPostImage,
  removePostImage,
  getPostMediaUpdate,
} from "@/features/publishing/postMediaAttachments";

import { validatePostWorkspaceContext } from "@/features/publishing/postWorkspaceContext";
import {
  createPostEditorSession,
  validatePostEditorSession,
  getPostEditorSessionError,
} from "@/features/publishing/postEditorSession";

type PostMode = "draft" | "scheduled" | "immediate";

type PostEditorRouteProps = {
  mode: "create" | "edit";
  postId?: string;
};


export function PostEditorRoute({ mode, postId }: PostEditorRouteProps) {
  const navigate = useNavigate();

  const { user } = useAuth();

  const recoveryOwnerUserId = user?.id ?? null;

  const location = useLocation();

  const plannerReturnUrl =
    mode === "create" ? getPlannerReturnUrl(location.search) : null;

  const plannerScheduledAt =
    mode === "create"
      ? getPlannerSchedulePrefill(
          new URLSearchParams(location.search).get("date"),
        )
      : null;

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

  const [facebookConnections, setFacebookConnections] = useState<
    FacebookPageConnectionOption[]
  >([]);

  const [selectedFacebookConnectionId, setSelectedFacebookConnectionId] =
    useState<string | null>(null);

  const [facebookConnectionsLoading, setFacebookConnectionsLoading] =
    useState(false);

  const [facebookConnectionsError, setFacebookConnectionsError] = useState<
    string | null
  >(null);

  // Editor content
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");

  const [mediaState, setMediaState] = useState(() => createPostMediaState());
  const contentScope = `${recoveryOwnerUserId}:${selectedWorkspaceId}`;
  const [contentWorkspaceId, setContentWorkspaceId] = useState(contentScope);
  if (mode === "create" && contentWorkspaceId !== contentScope) {
    setContentWorkspaceId(contentScope);
    setTitle("");
    setCaption("");
    setMediaState(createPostMediaState());
  }

  // The current UI supports one selected image.
  // The underlying API supports multiple media IDs.
  const selectedMediaAssetId = mediaState.selectedMediaIds[0] ?? null;

  // Publishing platforms
  const [selectedPlatforms, setSelectedPlatforms] = useState<PostPlatform[]>([
    "facebook",
  ]);

  const instagram = useInstagramConnections(
    selectedWorkspaceId ?? "",
    selectedPlatforms.includes("instagram"),
  );
  const [selectedInstagram, setSelectedInstagram] = useState<{
    workspaceId: string;
    id: string | null;
  }>({ workspaceId: "", id: null });
  const selectedInstagramConnectionId =
    selectedInstagram.workspaceId === selectedWorkspaceId
      ? selectedInstagram.id
      : null;
  const validInstagramConnection =
    !instagram.loading &&
    !instagram.error &&
    instagram.connections.some(
      (item) =>
        item.id === selectedInstagramConnectionId &&
        item.status === "connected" &&
        item.canPublish,
    );

  // Publishing options
  const [postMode, setPostMode] = useState<PostMode>(() =>
    plannerScheduledAt ? "scheduled" : "draft",
  );

  const [scheduledAt, setScheduledAt] = useState<string>(
    () => plannerScheduledAt ?? "",
  );

  const preferences = readWorkspacePreferences(selectedWorkspace);
  const scheduleTimezone = preferences.timezone;
  const [defaultsScope, setDefaultsScope] = useState("");
  const [explicitChoices, setExplicitChoices] = useState<Record<string, string>>({});
  function markExplicit(choice: string) {
    setExplicitChoices((current) => ({ ...current, [choice]: contentScope }));
  }
  if (selectedWorkspace && canApplyWorkspaceDefaults(mode, false, defaultsScope === contentScope)) {
    setDefaultsScope(contentScope);
    if (explicitChoices.mode !== contentScope) setPostMode(plannerScheduledAt ? "scheduled" : preferences.publishing.defaultPostMode);
    if (explicitChoices.schedule !== contentScope) {
      setScheduledAt(plannerScheduledAt ?? nextPreferredSchedule(preferences));
    }
    if (explicitChoices.platforms !== contentScope) setSelectedPlatforms([preferences.defaultDestinations.facebook ? "facebook" : preferences.defaultDestinations.linkedin ? "linkedin" : "facebook"]);
    if (explicitChoices.facebook !== contentScope) setSelectedFacebookConnectionId(preferences.defaultDestinations.facebook);
  }

  // Existing post loading
  const [loadingPost, setLoadingPost] = useState(mode === "edit");
  const [loadError, setLoadError] = useState("");

  const [postWorkspaceId, setPostWorkspaceId] = useState<string | null>(null);

  const editorSession = createPostEditorSession(
    mode,
    selectedWorkspaceId ?? "",
    mode === "edit" ? (postId ?? null) : null,
  );

  const editorSessionRef = useRef(editorSession);

  // Monotonically increasing revision prevents a session
  // that changes A -> B -> A from being mistaken for
  // an uninterrupted session.
  const editorSessionRevisionRef = useRef(0);

  useLayoutEffect(() => {
    const previous = editorSessionRef.current;

    const result = validatePostEditorSession(previous, editorSession);

    if (!result.valid) {
      editorSessionRevisionRef.current += 1;
    }

    editorSessionRef.current = editorSession;
  }, [mode, selectedWorkspaceId, postId]);

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

  // Operation state belongs to the current editor session. Late responses are
  // guarded below so they cannot lock or unlock another post's editor.
  useLayoutEffect(() => {
    setSaving(false);
    setPublishing(false);
    publishingLockRef.current = false;
    setSavedPublishingPostId(null);
    setPublishingMessage("");
    setPublishingOutcome(null);
    setError("");
  }, [mode, selectedWorkspaceId, postId]);

  const autosaveDate = parseZonedInput(scheduledAt, scheduleTimezone);
  const composerAutosave = useComposerAutosave({
    ownerId: recoveryOwnerUserId,
    enabled:
      mode === "create" && !selectedWorkspace?.archivedAt && !saving && !publishing && !savedPublishingPostId,
    content: {
      workspaceId: selectedWorkspaceId ?? "",
      title,
      caption,
      platforms: selectedPlatforms,
      mediaIds: [...mediaState.selectedMediaIds],
      ...(autosaveDate ? { scheduledAt: autosaveDate.toISOString() } : {}),
    },
  });

  const minScheduledAt = zonedInputValue(new Date(), scheduleTimezone);

  useEffect(() => {
    if (mode !== "edit" || !postId) {
      return;
    }

    let cancelled = false;

    // Capture the workspace, post, mode, and revision
    // before starting the asynchronous request.
    const loadingSession = captureEditorSession();

    async function loadPost() {
      setLoadingPost(true);
      setLoadError("");
      setPostWorkspaceId(null);

      try {
        const post = await getPostById(postId!);

        // A response from an earlier editor context
        // must never initialize the current editor.
        if (cancelled || checkEditorSession(loadingSession)) {
          return;
        }

        if (post.status !== "draft") {
          setLoadError("Only draft posts can be edited at this time.");
          return;
        }

        setPostWorkspaceId(post.workspaceId);
        setTitle(post.title ?? "");
        setCaption(post.caption);
        setSelectedPlatforms(post.platforms);

        setSelectedFacebookConnectionId(
          post.platformConnections?.facebook ?? null,
        );

        setSelectedInstagram({
          workspaceId: post.workspaceId,
          id: post.platformConnections?.instagram ?? null,
        });
        // Restore the original media snapshot.
        setMediaState(createPostMediaState(post.mediaIds ?? []));

        setPostMode("draft");
        setScheduledAt("");
      } catch (err) {
        if (cancelled || checkEditorSession(loadingSession)) {
          return;
        }

        setLoadError(
          err instanceof Error ? err.message : "Failed to load the post.",
        );
      } finally {
        if (!cancelled && !checkEditorSession(loadingSession)) {
          setLoadingPost(false);
        }
      }
    }

    void loadPost();

    return () => {
      cancelled = true;
    };
  }, [mode, postId, selectedWorkspaceId]);

  useEffect(() => {
    let cancelled = false;

    setFacebookConnections([]);
    setFacebookConnectionsError(null);

    if (!selectedWorkspaceId) {
      setFacebookConnectionsLoading(false);
      return;
    }

    setFacebookConnectionsLoading(true);

    async function loadConnections() {
      try {
        const connections = await getFacebookPageConnections(
          selectedWorkspaceId!,
        );

        if (!cancelled) {
          setFacebookConnections(connections);
        }
      } catch (err) {
        if (!cancelled) {
          setFacebookConnectionsError(
            err instanceof Error
              ? err.message
              : "Unable to load Facebook Pages.",
          );
        }
      } finally {
        if (!cancelled) {
          setFacebookConnectionsLoading(false);
        }
      }
    }

    void loadConnections();

    return () => {
      cancelled = true;
    };
  }, [selectedWorkspaceId]);

  useEffect(() => {
    // Creating a post uses the active workspace.
    // Clear temporary media when that workspace changes.
    //
    // In edit mode, the post-loading effect owns
    // restoration of the saved media state.
    if (mode !== "create") {
      return;
    }

    setMediaState(createPostMediaState());
  }, [mode, selectedWorkspaceId]);

  useEffect(() => {
    // A pending confirmation is tied to the workspace
    // and post from which it was opened.
    //
    // Dismiss it when that context changes.
    setShowPublishConfirmation(false);
  }, [mode, postId, selectedWorkspaceId]);

  function handleMediaSelect(assetId: string) {
    setMediaState((current) => selectPostImage(current, assetId));
    setError("");
  }

  function handleMediaRemove() {
    setMediaState((current) => removePostImage(current));
    setError("");
  }

  const workspaceContext = validatePostWorkspaceContext({
    mode,
    activeWorkspaceId: selectedWorkspaceId,
    postWorkspaceId,
  });

  function captureEditorSession() {
    return {
      session: editorSessionRef.current,
      revision: editorSessionRevisionRef.current,
    };
  }

  function checkEditorSession(
    captured: ReturnType<typeof captureEditorSession>,
  ): string | null {
    const result = validatePostEditorSession(
      captured.session,
      editorSessionRef.current,
    );

    if (
      !result.valid ||
      captured.revision !== editorSessionRevisionRef.current
    ) {
      return (
        getPostEditorSessionError(result) ??
        "The editor workspace or post changed during this operation. " +
          "Check your Posts page before retrying."
      );
    }

    return null;
  }

  async function handleSave() {
    if (saving || showPublishConfirmation) {
      return;
    }

    // Applies to BOTH new posts and existing drafts.
    // Do not submit an update under the wrong workspace.
    if (!workspaceContext.valid) {
      setError(
        workspaceContext.message ?? "Unable to verify the post workspace.",
      );
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

    if (selectedPlatforms.includes("facebook")) {
      const validSelection = facebookConnections.some(
        (connection) =>
          connection.id === selectedFacebookConnectionId &&
          connection.status === "connected" &&
          connection.canPublish,
      );

      if (
        facebookConnectionsLoading ||
        facebookConnectionsError ||
        !validSelection
      ) {
        setError(
          "Select a connected Facebook Page with publishing permission.",
        );
        return;
      }
    }

    if (
      postMode === "scheduled" &&
      selectedPlatforms.includes("instagram") &&
      (!validInstagramConnection ||
        mediaState.selectedMediaIds.length !== 1 ||
        caption.trim().length > 2200)
    ) {
      setError(
        "Instagram scheduling requires a connected account, one image, and a caption of at most 2,200 characters.",
      );
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

      // Scheduled media publishing is not supported yet.
      // Image attachments can be saved with drafts only.
      if (
        postMode === "scheduled" &&
        !selectedPlatforms.includes("instagram") &&
        mediaState.selectedMediaIds.length > 0
      ) {
        setError(
          "Scheduled image publishing is not supported yet. " +
            "Save this post as a draft or remove the image.",
        );
        return;
      }

      let scheduledAtIso: string | undefined;

      if (postMode === "scheduled") {
        if (!scheduledAt) {
          setError("Select a date and time for your scheduled post.");
          return;
        }

        const scheduledDate = parseZonedInput(scheduledAt, scheduleTimezone);

        if (!scheduledDate) {
          setError("Enter a valid scheduling date and time.");
          return;
        }

        if (scheduledDate.getTime() <= Date.now()) {
          setError("Scheduled time must be in the future.");
          return;
        }

        scheduledAtIso = toScheduledAtISOString(scheduledDate);
      }

      // LinkedIn requires a connected account.
      if (
        selectedPlatforms.includes("linkedin") &&
        (linkedInStatus !== "connected" || !linkedInConnectionId)
      ) {
        setError("Connect a LinkedIn account before selecting LinkedIn.");
        return;
      }

      if (!workspaceContext.valid) {
        setError(
          workspaceContext.message ?? "Unable to verify the post workspace.",
        );
        return;
      }

      const saveSession = captureEditorSession();

      setSaving(true);
      setError("");

      try {
        await createPost({
          clientDraftId: composerAutosave.clientDraftId,
          workspaceId: selectedWorkspace._id,
          title: trimmedTitle || "Untitled",
          caption: trimmedCaption,
          mediaIds: [...mediaState.selectedMediaIds],
          platforms: selectedPlatforms,
          scheduledAt: scheduledAtIso,
          platformConnections: {
            ...(selectedPlatforms.includes("instagram") &&
            validInstagramConnection &&
            selectedInstagramConnectionId
              ? { instagram: selectedInstagramConnectionId }
              : {}),
            ...(selectedPlatforms.includes("linkedin") && linkedInConnectionId
              ? { linkedin: linkedInConnectionId }
              : {}),

            ...(selectedPlatforms.includes("facebook") &&
            selectedFacebookConnectionId
              ? { facebook: selectedFacebookConnectionId }
              : {}),
          },
        });

        composerAutosave.complete();
        // The server may have saved this draft successfully,
        // even if the user changed workspaces meanwhile.
        //
        // Never navigate based on a response belonging
        // to an earlier editor session.
        if (checkEditorSession(saveSession)) {
          return;
        }

        navigate(plannerReturnUrl ?? "/posts", {
          replace: true,
        });
      } catch (err) {
        if (checkEditorSession(saveSession)) {
          return;
        }

        setError(
          err instanceof Error ? err.message : "Failed to create the draft.",
        );
      } finally {
        if (!checkEditorSession(saveSession)) {
          setSaving(false);
        }
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

    const saveSession = captureEditorSession();

    setSaving(true);
    setError("");

    try {
      await updateDraftPost(postId, {
        title: trimmedTitle,
        caption: trimmedCaption,
        ...getPostMediaUpdate(mediaState),
        platforms: selectedPlatforms,

        platformConnections: {
          ...(selectedPlatforms.includes("linkedin") &&
          linkedInStatus === "connected" &&
          linkedInConnectionId
            ? { linkedin: linkedInConnectionId }
            : {}),
          ...(selectedPlatforms.includes("instagram") &&
          validInstagramConnection &&
          selectedInstagramConnectionId
            ? { instagram: selectedInstagramConnectionId }
            : {}),
          ...(selectedPlatforms.includes("facebook") &&
          selectedFacebookConnectionId
            ? { facebook: selectedFacebookConnectionId }
            : {}),
        },
      });

      if (checkEditorSession(saveSession)) {
        return;
      }

      navigate("/posts");
    } catch (err) {
      if (checkEditorSession(saveSession)) {
        return;
      }

      setError(
        err instanceof Error ? err.message : "Failed to update the draft.",
      );
    } finally {
      if (!checkEditorSession(saveSession)) {
        setSaving(false);
      }
    }
  }

  async function handleConfirmPublish() {
    if (publishingLockRef.current || publishing || saving) {
      return;
    }

    if (!selectedWorkspaceId) {
      setShowPublishConfirmation(false);
      setError("Select a workspace before publishing.");
      return;
    }

    if (!workspaceContext.valid) {
      setShowPublishConfirmation(false);
      setError(
        workspaceContext.message ?? "Unable to verify the post workspace.",
      );
      return;
    }

    if (savedPublishingPostId) {
      setShowPublishConfirmation(false);
      setPublishingOutcome("unknown");
      setPublishingMessage(
        "A publishing attempt has already been started for this post. " +
          "Check your Posts page and selected social account before retrying.",
      );
      return;
    }

    const platform = selectedPlatforms[0];

    const validFacebookConnection = facebookConnections.some(
      (connection) =>
        connection.id === selectedFacebookConnectionId &&
        connection.status === "connected" &&
        connection.canPublish,
    );

    const connectionId =
      platform === "facebook"
        ? selectedFacebookConnectionId
        : platform === "linkedin"
          ? linkedInConnectionId
          : platform === "instagram"
            ? selectedInstagramConnectionId
            : null;

    const validConnection =
      platform === "facebook"
        ? !facebookConnectionsLoading &&
          !facebookConnectionsError &&
          validFacebookConnection
        : platform === "linkedin"
          ? linkedInStatus === "connected" && Boolean(linkedInConnectionId)
          : platform === "instagram" && validInstagramConnection;

    if (
      (mode === "edit" && !postId) ||
      mediaState.selectedMediaIds.length > 1 ||
      !selectedWorkspace ||
      !caption.trim() ||
      (platform === "instagram" &&
        (mediaState.selectedMediaIds.length !== 1 ||
          caption.trim().length > 2200)) ||
      selectedPlatforms.length !== 1 ||
      !validConnection ||
      !connectionId
    ) {
      setShowPublishConfirmation(false);
      setError(
        "Publishing requirements changed. Review your workspace, " +
          "caption, selected platform, and publishing connection.",
      );
      return;
    }

    const publishingPlatform = platform as
      | "facebook"
      | "linkedin"
      | "instagram";
    const platformLabel =
      publishingPlatform === "instagram"
        ? "Instagram"
        : publishingPlatform === "facebook"
          ? "Facebook"
          : "LinkedIn";

    const platformConnections = {
      [publishingPlatform]: connectionId,
    };

    const publishingSession = captureEditorSession();

    publishingLockRef.current = true;

    setPublishing(true);
    setSaving(true);
    setError("");
    setPublishingMessage("");
    setPublishingOutcome(null);

    let savedPostId: string | null = null;
    let publishRequestStarted = false;

    try {
      let targetPostId: string;

      if (mode === "edit") {
        await updateDraftPost(postId!, {
          title: title.trim() || "Untitled",
          caption: caption.trim(),
          ...getPostMediaUpdate(mediaState),
          platforms: [publishingPlatform],
          platformConnections,
        });

        targetPostId = postId!;
        savedPostId = targetPostId;
      } else {
        const draft = await createPost({
          clientDraftId: composerAutosave.clientDraftId,
          workspaceId: selectedWorkspace._id,
          title: title.trim() || "Untitled",
          caption: caption.trim(),
          platforms: [publishingPlatform],
          mediaIds: [...mediaState.selectedMediaIds],
          platformConnections,
        });

        composerAutosave.complete();
        targetPostId = draft._id;
        savedPostId = targetPostId;
      }

      // A save may finish after switching workspaces or posts. Do not carry
      // its lock into the new editor or start an external publishing request.
      if (checkEditorSession(publishingSession)) return;
      setSavedPublishingPostId(targetPostId);

      // Do not place another await between this check
      // and the publishing API request.
      publishRequestStarted = true;

      const response = await publishPostNow(targetPostId);

      if (checkEditorSession(publishingSession)) return;

      const platformResult = response.result.results.find(
        (result) => result.platform === publishingPlatform,
      );

      const confirmedPublished =
        platformResult?.outcome === "published" &&
        response.post.status === "published";

      if (confirmedPublished) {
        setPublishingOutcome("published");
        setPublishingMessage(
          `Your post was successfully published to ${platformLabel}.`,
        );
        setShowPublishConfirmation(false);
        return;
      }

      const confirmedFailed =
        platformResult?.outcome === "failed" &&
        response.post.status === "failed";

      if (confirmedFailed) {
        setPublishingOutcome("failed");
        setPublishingMessage(
          platformResult.message ||
            response.post.lastError ||
            `${platformLabel} publishing failed. Your post was saved in Storm.`,
        );
        setShowPublishConfirmation(false);
        return;
      }

      setPublishingOutcome("unknown");
      setPublishingMessage(
        `Storm could not confirm whether ${platformLabel} published this post. ` +
          `Check your ${platformLabel} account and Posts page before taking further action.`,
      );
      setShowPublishConfirmation(false);
    } catch (err) {
      if (checkEditorSession(publishingSession)) return;
      const errorMessage =
        err instanceof Error ? err.message : "An unexpected error occurred.";

      if (publishRequestStarted) {
        setPublishingOutcome("unknown");
        setPublishingMessage(
          `Storm could not confirm the ${platformLabel} publishing outcome. ` +
            `Check your ${platformLabel} account and Posts page before retrying. ` +
            errorMessage,
        );
      } else if (savedPostId) {
        setPublishingOutcome("failed");
        setPublishingMessage(
          "The publishing request was not started. " +
            "Your saved draft remains in Storm. " +
            errorMessage,
        );
      } else {
        setPublishingOutcome("failed");
        setPublishingMessage(
          mode === "edit"
            ? "Storm could not confirm that your draft changes were saved. " +
                "No publishing request was started. Check Posts before retrying. " +
                errorMessage
            : "Storm could not confirm that your draft was created. " +
                "No publishing request was started. Check Posts before retrying. " +
                errorMessage,
        );
      }

      setShowPublishConfirmation(false);
    } finally {
      if (!checkEditorSession(publishingSession)) {
        setPublishing(false);
        setSaving(false);
        if (!publishRequestStarted && !savedPostId) {
          publishingLockRef.current = false;
        }
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

    if (!workspaceContext.valid) {
      setError(
        workspaceContext.message ?? "Unable to verify the post workspace.",
      );
      return;
    }

    if (mediaState.selectedMediaIds.length > 1) {
      setError("Publishing supports one image per post.");
      return;
    }

    if (mode === "edit" && !postId) {
      setError("Post ID is missing.");
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

    if (selectedPlatforms.length !== 1) {
      setError("Select exactly one platform for Publish Now.");
      return;
    }

    const platform = selectedPlatforms[0];

    if (platform === "linkedin") {
      if (linkedInStatus !== "connected" || !linkedInConnectionId) {
        setError("Connect a LinkedIn account before publishing.");
        return;
      }
    } else if (platform === "facebook") {
      const validSelection = facebookConnections.some(
        (connection) =>
          connection.id === selectedFacebookConnectionId &&
          connection.status === "connected" &&
          connection.canPublish,
      );

      if (
        facebookConnectionsLoading ||
        facebookConnectionsError ||
        !validSelection
      ) {
        setError(
          "Select a connected Facebook Page with publishing permission.",
        );
        return;
      }
    } else if (platform === "instagram") {
      if (
        !validInstagramConnection ||
        mediaState.selectedMediaIds.length !== 1 ||
        caption.trim().length > 2200
      ) {
        setError(
          "Select a connected Instagram account, one image, and a caption of at most 2,200 characters.",
        );
        return;
      }
    } else {
      setError("Publish Now does not support this platform yet.");
      return;
    }

    setShowPublishConfirmation(true);
  }

  function handleCancel() {
    if (publishing || saving) {
      return;
    }

    navigate(plannerReturnUrl ?? "/posts");
  }

  const publishingPlatformLabel =
    selectedPlatforms[0] === "instagram"
      ? "Instagram"
      : selectedPlatforms[0] === "facebook"
        ? "Facebook"
        : "LinkedIn";

  // Phase 13.3.1:
  // Derive checklist data from the existing editor state.
  // Do not replace the current publishing submission flow.

  const timezone = scheduleTimezone;

  let checklistDraft = createPublishingDraft(
    selectedWorkspaceId ?? "",
    timezone,
  );

  checklistDraft = setSharedCaption(checklistDraft, caption);

  // Readiness must reflect the CURRENT editor selection,
  // including media added to a new draft, replacement,
  // or explicit removal from an existing draft.
  checklistDraft = setSharedMedia(
    checklistDraft,
    mediaState.selectedMediaIds.map((assetId) => ({
      assetId,
      type: "image" as const,
    })),
  );

  const accountCapabilities: PublishingCapabilityContext = {
    accounts: {},
  };

  for (const platform of selectedPlatforms) {
    let connectionId = "";
    let accountName: string = platform;
    let format: PublishingDestination["format"] = mediaState.selectedMediaIds
      .length
      ? "image"
      : "text";
    let connected = false;
    let canPublish = false;

    if (platform === "facebook") {
      const connection = facebookConnections.find(
        (item) => item.id === selectedFacebookConnectionId,
      );

      connectionId = connection?.id ?? "";
      accountName = connection?.pageName ?? "Select a Facebook Page";

      connected = connection?.status === "connected";
      canPublish = connection?.canPublish === true;
    }

    if (platform === "linkedin") {
      connectionId = linkedInConnectionId ?? "";
      accountName = linkedInDisplayName ?? "LinkedIn account";

      connected =
        linkedInStatus === "connected" && Boolean(linkedInConnectionId);

      canPublish = connected;
    }

    if (platform === "instagram") {
      const connection = instagram.connections.find(
        (item) => item.id === selectedInstagramConnectionId,
      );
      connectionId = connection?.id ?? "";
      accountName = connection
        ? `@${connection.username}`
        : "Select an Instagram account";
      connected = validInstagramConnection;
      canPublish = validInstagramConnection;
      format = "image";
    }

    const destination: PublishingDestination = {
      id: `${platform}:${connectionId || "unconnected"}`,
      platform,
      connectionId,
      accountName,
      format,
    };

    checklistDraft = addDestination(checklistDraft, destination);

    if (connectionId) {
      accountCapabilities.accounts[destination.id] = {
        connectionId,
        connected,
        canPublish,
      };
    }
  }

  if (postMode === "scheduled" && scheduledAt) {
    const parsed = parseZonedInput(scheduledAt, scheduleTimezone);

    checklistDraft.publishing.scheduledAt = parsed
      ? toScheduledAtISOString(parsed)
      : "";
  }

  const readiness = evaluatePublishingReadiness(
    checklistDraft,
    accountCapabilities,
    postMode === "immediate"
      ? "now"
      : postMode === "scheduled"
        ? "schedule"
        : "draft",
  );

  const checklistBlockers: string[] = [];

  if (!workspaceContext.valid) {
    checklistBlockers.push(
      workspaceContext.message ?? "Unable to verify the post workspace.",
    );
  }

  if (mode === "edit" && postMode === "scheduled") {
    checklistBlockers.push(
      "Scheduling an existing draft is not supported by " +
        "the current editor.",
    );
  }

  if (
    postMode === "immediate" &&
    (workspacesLoading || workspaceError || !selectedWorkspace)
  ) {
    checklistBlockers.push(
      "Select a verified active workspace before publishing.",
    );
  }

  const editorContent = selectedWorkspace?.archivedAt ? (
    <p role="alert" className="rounded-xl bg-amber-50 p-6 text-amber-900">This workspace is archived. Restore it in workspace settings before creating or editing posts.</p>
  ) : loadingPost ? (
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
        className="mt-4 rounded-lg bg-white px-4 py-2 text-sm font-normal text-slate-700 shadow-sm"
      >
        Back to Posts
      </button>
    </div>
  ) : (
    <PostEditorForm
      captionSessionKey={`${mode}:${postId ?? "new"}`}
      defaultLanguage={preferences.defaultLanguage}
      mode={mode}
      recoveryOwnerUserId={recoveryOwnerUserId}
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
        markExplicit("platforms");
        setSelectedPlatforms(platforms);
        setError("");
      }}
      onPostModeChange={(value) => {
        markExplicit("mode");
        setPostMode(value);
        setError("");
      }}
      onScheduledAtChange={(value) => {
        markExplicit("schedule");
        setScheduledAt(value);
        setError("");
      }}
      instagramConnections={instagram.connections}
      selectedInstagramConnectionId={selectedInstagramConnectionId}
      instagramLoading={instagram.loading}
      instagramError={instagram.error}
      onInstagramConnectionChange={(id) =>
        setSelectedInstagram({ workspaceId: selectedWorkspaceId ?? "", id })
      }
      onConnectInstagram={(id) => {
        void instagram.connect(id);
      }}
      facebookConnections={facebookConnections}
      selectedFacebookConnectionId={
        facebookConnections.some(
          (connection) =>
            connection.id === selectedFacebookConnectionId &&
            connection.canPublish &&
            connection.status === "connected",
        )
          ? selectedFacebookConnectionId
          : null
      }
      facebookConnectionsLoading={facebookConnectionsLoading}
      facebookConnectionsError={facebookConnectionsError}
      onFacebookConnectionChange={(connectionId) => {
        markExplicit("facebook");
        setSelectedFacebookConnectionId(connectionId);
        setError("");
      }}
      workspaceId={
        workspaceContext.valid
          ? mode === "edit"
            ? postWorkspaceId
            : selectedWorkspaceId
          : null
      }
      selectedMediaAssetId={selectedMediaAssetId}
      onMediaSelect={handleMediaSelect}
      onMediaRemove={handleMediaRemove}
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
          sidebar={
            !loadingPost && !loadError && !selectedWorkspace?.archivedAt ? (
              <div className="space-y-5">
                <PublishingControls
                  editorMode={mode}
                  postMode={postMode}
                  scheduledAt={scheduledAt}
                  minScheduledAt={minScheduledAt}
                  timezone={scheduleTimezone}
                  saving={saving || publishing}
                  locked={savedPublishingPostId !== null}
                  readiness={readiness}
                  blockers={checklistBlockers}
                  formId="storm-post-editor-form"
                  onPostModeChange={(value) => {
                    markExplicit("mode");
                    setPostMode(value);
                    setError("");
                  }}
                  onScheduledAtChange={(value) => {
                    markExplicit("schedule");
                    setScheduledAt(value);
                    setError("");
                  }}
                  onCancel={handleCancel}
                />
                <details className="group border-t border-slate-100 pt-4">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-700 focus-visible:outline-violet-500">
                    View publishing checklist{" "}
                    <span className="ml-1 text-xs font-normal text-slate-400">
                      {readiness.readyCount}/{readiness.totalCount} ready
                    </span>
                  </summary>
                  <div className="mt-4">
                    <PublishingChecklistPanel
                      readiness={readiness}
                      blockers={checklistBlockers}
                    />
                  </div>
                </details>
              </div>
            ) : undefined
          }
          preview={
            !loadingPost && !loadError && !selectedWorkspace?.archivedAt ? (
              <PostPreview
                title={title}
                selectedMediaAssetId={selectedMediaAssetId}
                accountName={
                  selectedPlatforms[0] === "facebook"
                    ? facebookConnections.find(
                        (connection) =>
                          connection.id === selectedFacebookConnectionId,
                      )?.pageName || "Your Facebook Page"
                    : selectedPlatforms[0] === "linkedin"
                      ? linkedInDisplayName || "Your LinkedIn account"
                      : `@${instagram.connections.find((item) => item.id === selectedInstagramConnectionId)?.username ?? "Instagram account"}`
                }
                caption={caption}
                platforms={selectedPlatforms}
              />
            ) : undefined
          }
        >
          <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-normal uppercase tracking-wide text-slate-500">
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
                    Publishing to {publishingPlatformLabel}...
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
          {!loadingPost && !loadError && !workspaceContext.valid && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4"
            >
              <p className="text-sm font-semibold text-amber-900">
                Workspace verification required
              </p>

              <p className="mt-1 text-sm text-amber-800">
                {workspaceContext.message}
              </p>
            </div>
          )}
          {mode === "create" && (
            <p role="status" className="mb-4 text-xs text-slate-600">
              {composerAutosave.status === "saving"
                ? "Saving draft..."
                : composerAutosave.status === "saved"
                  ? "Draft saved automatically"
                  : composerAutosave.status === "pending"
                    ? "Draft saved on this device; waiting to sync"
                    : composerAutosave.status === "unavailable"
                      ? "Autosave unavailable. Save your draft before leaving."
                      : "Your work saves automatically as a draft"}
            </p>
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
              Publish to {publishingPlatformLabel}?
            </h2>

            <p
              id="publish-confirmation-description"
              className="mt-3 text-sm leading-6 text-slate-600"
            >
              This will immediately publish your post to your selected{" "}
              {publishingPlatformLabel} destination.
            </p>

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Publishing Account
              </p>

              <p className="mt-2 text-sm font-semibold text-slate-900">
                {selectedPlatforms[0] === "facebook"
                  ? facebookConnections.find(
                      (connection) =>
                        connection.id === selectedFacebookConnectionId,
                    )?.pageName || "Selected Facebook Page"
                  : selectedPlatforms[0] === "instagram"
                    ? `@${instagram.connections.find((item) => item.id === selectedInstagramConnectionId)?.username ?? "Instagram account"}`
                    : linkedInDisplayName || "Connected LinkedIn account"}
              </p>

              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Post Preview
              </p>

              <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-sm text-slate-700">
                {caption.trim()}
              </p>
              {selectedMediaAssetId && (
                <p className="mt-3 text-sm font-normal text-violet-700">
                  Includes your selected image.
                </p>
              )}
            </div>

            <p className="mt-4 text-xs leading-5 text-amber-700">
              Once published, this post may be visible to other{" "}
              {publishingPlatformLabel} users. Publishing cannot be undone from
              Storm.
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
