import { ImageReferenceInput } from "@/features/image-studio/components/ImageReferenceInput";
import { useImageReference } from "@/features/image-studio/hooks/useImageReference";
import { ImageGenerationProgress } from "@/features/image-studio/components/ImageGenerationProgress";
import { ApiError } from "@/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  getImageGenerationCredits,
  validateImagePrompt,
  getWorkspaceImageStatus,
  createImageRequestKey,
  generateWorkspaceImage,
  type GenerateImageCommand,
  type ImageGenerationDetails,
  type ImageAspectRatio,
  type ImageGenerationCredits,
} from "@/lib/imageGeneration";

import {
  clearPublishingRecovery,
  createAcceptedRecovery,
  createUncertainRecovery,
  readPublishingRecovery,
  savePublishingRecovery,
  type RecoveryScope,
  type RecoveryStorage,
} from "@/features/publishing/publishingImageRecovery";

import { snapshotImageGenerationCommand } from "@/lib/imageGenerationCommandSnapshot";

import { getWorkspaceImageUrl } from "@/lib/imageGeneration";

import {
  DEFAULT_PUBLISHING_BRANDING,
  PublishingImageBrandingFields,
  createPublishingImageBranding,
  validatePublishingBrandingSettings,
  type PublishingBrandingSettings,
  type PublishingLogoAvailability,
} from "./PublishingImageBrandingFields";

type Props = {
  workspaceId: string | null;
  ownerUserId: string | null;

  // Called only when a ready, authorized preview
  // is explicitly selected by the user.
  onUseImage?: (assetId: string) => void;

  // Prevent media changes while the editor is
  // saving or locked after a publishing attempt.
  disabled?: boolean;
};

type CreditsSnapshot = {
  workspaceId: string;
  value: ImageGenerationCredits;
};

const ASPECT_RATIOS: Array<{
  value: ImageAspectRatio;
  label: string;
  dimensions: string;
}> = [
  {
    value: "square",
    label: "Square",
    dimensions: "1:1",
  },
  {
    value: "portrait",
    label: "Portrait",
    dimensions: "2:3",
  },
  {
    value: "landscape",
    label: "Landscape",
    dimensions: "3:2",
  },
];

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unable to load image generation credits.";
}

export function PublishingImageGenerator({
  workspaceId,
  ownerUserId,
  onUseImage,
  disabled = false,
}: Props) {
  const [prompt, setPrompt] = useState("");

  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>("square");

  const [brandingSettings, setBrandingSettings] =
    useState<PublishingBrandingSettings>({
      ...DEFAULT_PUBLISHING_BRANDING,
    });

  type ScopedPublishingLogoAvailability = PublishingLogoAvailability & {
    ownerUserId: string | null;
  };

  const [logoAvailability, setLogoAvailability] =
    useState<ScopedPublishingLogoAvailability | null>(null);

  const handleLogoAvailabilityChange = useCallback(
    (next: PublishingLogoAvailability) => {
      const scopedNext: ScopedPublishingLogoAvailability = {
        ...next,
        ownerUserId,
      };

      setLogoAvailability((current) => {
        if (
          current?.ownerUserId === scopedNext.ownerUserId &&
          current.workspaceId === scopedNext.workspaceId &&
          current.status === scopedNext.status &&
          current.available === scopedNext.available
        ) {
          return current;
        }

        return scopedNext;
      });
    },
    [ownerUserId],
  );

  const logoVerified =
    Boolean(ownerUserId) &&
    Boolean(workspaceId) &&
    logoAvailability?.ownerUserId === ownerUserId &&
    logoAvailability?.workspaceId === workspaceId &&
    logoAvailability?.status === "available" &&
    logoAvailability?.available === true;

  const brandingValidationError = validatePublishingBrandingSettings(
    brandingSettings,
    logoVerified,
  );

  const [creditsSnapshot, setCreditsSnapshot] =
    useState<CreditsSnapshot | null>(null);

  const [loadingCredits, setLoadingCredits] = useState(false);

  const [creditsError, setCreditsError] = useState("");

  const [refreshVersion, setRefreshVersion] = useState(0);
  const [statusRefreshVersion, setStatusRefreshVersion] = useState(0);

  type SubmissionStatus = "idle" | "submitting" | "accepted" | "uncertain";

  const [submissionStatus, setSubmissionStatus] =
    useState<SubmissionStatus>("idle");

  const [submissionError, setSubmissionError] = useState("");

  const [submittedAssetId, setSubmittedAssetId] = useState<string | null>(null);

  const [pendingRetry, setPendingRetry] = useState<GenerateImageCommand | null>(
    null,
  );

  const [submittedWorkspaceId, setSubmittedWorkspaceId] = useState<
    string | null
  >(null);

  type RecoveryLoadStatus = "checking" | "empty" | "found" | "blocked";

  const [recoveryLoadStatus, setRecoveryLoadStatus] =
    useState<RecoveryLoadStatus>("checking");

  const [recoveryError, setRecoveryError] = useState("");

  const [generationDetails, setGenerationDetails] =
    useState<ImageGenerationDetails | null>(null);

  const [generationStatusError, setGenerationStatusError] = useState("");

  type PrivatePreview = {
    workspaceId: string;
    assetId: string;
    url: string;
  };

  const [privatePreview, setPrivatePreview] = useState<PrivatePreview | null>(
    null,
  );

  const [previewLoading, setPreviewLoading] = useState(false);

  const [previewError, setPreviewError] = useState("");

  const [previewRefreshVersion, setPreviewRefreshVersion] = useState(0);

  const recoveryScope =
    ownerUserId && workspaceId
      ? {
          ownerUserId,
          workspaceId,
        }
      : null;

  // Prevent rapid clicks from submitting multiple requests
  // before React has rendered a disabled button.
  const submissionLockRef = useRef(false);

  // Invalidates responses after a workspace switch or
  // component unmount.
  const requestVersionRef = useRef(0);

  useEffect(() => {
    // A new workspace starts a new composer generation session.
    setSubmissionStatus("idle");
    setSubmissionError("");
    setSubmittedAssetId(null);
    setSubmittedWorkspaceId(null);
    setPendingRetry(null);
    setGenerationDetails(null);
    setGenerationStatusError("");

    setPrivatePreview(null);
    setPreviewLoading(false);
    setPreviewError("");
    setPreviewRefreshVersion(0);

    setBrandingSettings({
      ...DEFAULT_PUBLISHING_BRANDING,
    });

    setRecoveryLoadStatus("checking");
    setRecoveryError("");

    submissionLockRef.current = false;

    // Invalidate previous-workspace asynchronous responses.
    return () => {
      requestVersionRef.current += 1;
    };
  }, [workspaceId, ownerUserId]);

  useEffect(() => {
    const scope = getCurrentRecoveryScope();
    const storage = getRecoveryStorage();

    if (!scope) {
      setRecoveryLoadStatus("blocked");
      setRecoveryError(
        "Sign in and select a workspace before generating images.",
      );
      return;
    }

    if (!storage) {
      setRecoveryLoadStatus("blocked");
      setRecoveryError(
        "Browser session storage is unavailable. " +
          "Image generation is disabled to protect recovery.",
      );
      return;
    }

    const result = readPublishingRecovery(storage, scope);

    if (result.status === "empty") {
      setRecoveryLoadStatus("empty");
      setRecoveryError("");
      return;
    }

    if (result.status !== "found") {
      setRecoveryLoadStatus("blocked");
      setRecoveryError(
        result.status === "invalid"
          ? "An existing generation recovery record " +
              "could not be verified. Do not start another " +
              "generation until this operation is reviewed."
          : "Generation recovery storage could not be read.",
      );
      return;
    }

    const record = result.record;

    setRecoveryLoadStatus("found");
    setRecoveryError("");

    if (record.state === "accepted") {
      setSubmittedWorkspaceId(record.workspaceId);
      setSubmittedAssetId(record.assetId);
      setPendingRetry(null);
      setSubmissionError("");
      setGenerationDetails(null);
      setSubmissionStatus("accepted");

      // The existing status effect resumes GET polling.
      // No generation POST is submitted here.
      return;
    }

    setSubmittedWorkspaceId(null);
    setSubmittedAssetId(null);
    setGenerationDetails(null);

    setPendingRetry(record.command);
    setSubmissionStatus("uncertain");

    setSubmissionError(
      "Storm found an unfinished generation request. " +
        "Verify the original request using the button below. " +
        "Do not start a new generation.",
    );
  }, [ownerUserId, workspaceId]);

  useEffect(() => {
    let active = true;

    if (!workspaceId) {
      return () => {
        active = false;
      };
    }

    // Invalidate the previous workspace's balance
    // while the new request is in flight.
    setLoadingCredits(true);
    setCreditsError("");

    void getImageGenerationCredits(workspaceId)
      .then((value) => {
        if (!active) return;

        setCreditsSnapshot({
          workspaceId,
          value,
        });
      })
      .catch((error: unknown) => {
        if (!active) return;

        setCreditsSnapshot(null);
        setCreditsError(getErrorMessage(error));
      })
      .finally(() => {
        if (active) {
          setLoadingCredits(false);
        }
      });

    return () => {
      active = false;
    };
  }, [workspaceId, refreshVersion]);

  // Fetch the status when a generation has been accepted.
  // This only performs a GET request.
  useEffect(() => {
    if (
      !workspaceId ||
      !submittedAssetId ||
      submittedWorkspaceId !== workspaceId ||
      submissionStatus !== "accepted"
    ) {
      return;
    }

    let active = true;

    const assetId = submittedAssetId;
    const requestWorkspaceId = workspaceId;

    async function loadInitialStatus() {
      try {
        const details = await getWorkspaceImageStatus(
          requestWorkspaceId,
          assetId,
        );

        if (!active) return;

        // Never accept details for a different asset.
        if (details.assetId !== assetId) {
          setGenerationStatusError(
            "The generation status response did not match " +
              "the requested image.",
          );
          return;
        }

        setGenerationDetails(details);
        setGenerationStatusError("");
      } catch (error) {
        if (!active) return;

        setGenerationStatusError(
          error instanceof Error
            ? error.message
            : "Unable to retrieve image generation status.",
        );
      }
    }

    void loadInitialStatus();

    return () => {
      active = false;
    };
  }, [
    workspaceId,
    submittedAssetId,
    submittedWorkspaceId,
    submissionStatus,
    statusRefreshVersion,
  ]);

  // Poll only a previously admitted operation.
  //
  // Never resend the generation POST while polling.
  useEffect(() => {
    if (
      !workspaceId ||
      !submittedAssetId ||
      submittedWorkspaceId !== workspaceId ||
      submissionStatus !== "accepted" ||
      generationDetails?.state !== "processing"
    ) {
      return;
    }

    let active = true;
    let inFlight = false;
    let nextPollAt = 0;
    let retryDelay = 4000;

    const assetId = submittedAssetId;
    const requestWorkspaceId = workspaceId;

    const interval = window.setInterval(() => {
      if (!active || inFlight || Date.now() < nextPollAt) return;

      inFlight = true;

      void getWorkspaceImageStatus(requestWorkspaceId, assetId)
        .then((details) => {
          if (!active) return;

          if (details.assetId !== assetId) {
            setGenerationStatusError(
              "The generation status response did not " +
                "match the requested image.",
            );
            return;
          }

          retryDelay = 4000;
          setGenerationDetails(details);
          setGenerationStatusError("");
        })
        .catch((error: unknown) => {
          if (!active) return;
          if (error instanceof ApiError && error.status === 429) {
            retryDelay = Math.min(retryDelay * 2, 60_000);
            nextPollAt =
              Date.now() + Math.max(retryDelay, error.retryAfterMs ?? 0);
          }

          setGenerationStatusError(
            error instanceof Error
              ? error.message
              : "Unable to refresh generation status.",
          );
        })
        .finally(() => {
          inFlight = false;
        });
    }, 4000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [
    workspaceId,
    submittedAssetId,
    submittedWorkspaceId,
    submissionStatus,
    generationDetails?.state,
  ]);

  // Load a private preview ONLY after the backend
  // confirms the generated image is ready.
  //
  // Signed URLs are temporary. They are not persisted
  // in the post draft or Media Library.
  useEffect(() => {
    const ready =
      submissionStatus === "accepted" &&
      generationDetails?.state === "ready" &&
      generationDetails.status === "ready";

    if (
      !ready ||
      !workspaceId ||
      !submittedAssetId ||
      submittedWorkspaceId !== workspaceId ||
      generationDetails.assetId !== submittedAssetId
    ) {
      return;
    }

    let active = true;

    const requestWorkspaceId = workspaceId;
    const requestAssetId = submittedAssetId;

    setPreviewLoading(true);
    setPreviewError("");

    // Keep the previously loaded preview hidden
    // while obtaining an updated signed URL.
    setPrivatePreview(null);

    async function loadPrivatePreview() {
      try {
        const result = await getWorkspaceImageUrl(
          requestWorkspaceId,
          requestAssetId,
        );

        if (!active) return;

        // Reject a response containing another asset ID.
        if (result.assetId !== requestAssetId) {
          setPreviewError(
            "The private preview response did not match " +
              "the requested image.",
          );
          return;
        }

        setPrivatePreview({
          workspaceId: requestWorkspaceId,
          assetId: requestAssetId,
          url: result.url,
        });

        setPreviewError("");
      } catch (error) {
        if (!active) return;

        setPreviewError(
          error instanceof Error
            ? error.message
            : "Unable to load the private image preview.",
        );
      } finally {
        if (active) {
          setPreviewLoading(false);
        }
      }
    }

    void loadPrivatePreview();

    return () => {
      active = false;
    };
  }, [
    workspaceId,
    submittedWorkspaceId,
    submittedAssetId,
    submissionStatus,
    generationDetails?.assetId,
    generationDetails?.state,
    generationDetails?.status,
    previewRefreshVersion,
  ]);

  function getRecoveryStorage(): RecoveryStorage | null {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  }

  function getCurrentRecoveryScope(): RecoveryScope | null {
    if (!ownerUserId || !workspaceId) {
      return null;
    }

    return {
      ownerUserId,
      workspaceId,
    };
  }
  const visiblePreview =
    privatePreview?.workspaceId === workspaceId &&
    privatePreview?.assetId === submittedAssetId &&
    generationDetails?.assetId === submittedAssetId &&
    generationDetails.state === "ready" &&
    generationDetails.status === "ready"
      ? privatePreview
      : null;

  const canUseGeneratedImage =
    !disabled &&
    Boolean(onUseImage) &&
    Boolean(ownerUserId) &&
    Boolean(workspaceId) &&
    recoveryLoadStatus === "found" &&
    submissionStatus === "accepted" &&
    submittedWorkspaceId === workspaceId &&
    Boolean(submittedAssetId) &&
    generationDetails?.assetId === submittedAssetId &&
    generationDetails?.state === "ready" &&
    generationDetails.status === "ready" &&
    visiblePreview !== null;

  function handleUseGeneratedImage() {
    if (!canUseGeneratedImage || !submittedAssetId || !onUseImage) {
      return;
    }

    // This is a local editor-selection handoff.
    // The backend validates the media attachment
    // when the draft is saved.
    onUseImage(submittedAssetId);
  }

  function handleFinishGeneration() {
    if (
      disabled ||
      submissionLockRef.current ||
      submissionStatus !== "accepted" ||
      recoveryLoadStatus !== "found" ||
      !ownerUserId ||
      !workspaceId ||
      !submittedAssetId ||
      submittedWorkspaceId !== workspaceId ||
      generationDetails?.assetId !== submittedAssetId ||
      generationDetails.state !== "ready" ||
      generationDetails.status !== "ready"
    ) {
      return;
    }

    const scope: RecoveryScope = {
      ownerUserId,
      workspaceId,
    };

    const storage = getRecoveryStorage();

    if (!storage) {
      setRecoveryError(
        "Browser session storage is unavailable. " +
          "The generation was not resolved.",
      );
      return;
    }

    const existing = readPublishingRecovery(storage, scope);

    // Verify that we are resolving EXACTLY the
    // accepted generation displayed in the UI.
    //
    // Never clear an uncertain request or a record
    // belonging to a different image.
    if (
      existing.status !== "found" ||
      existing.record.state !== "accepted" ||
      existing.record.assetId !== submittedAssetId
    ) {
      setRecoveryLoadStatus("blocked");
      setRecoveryError(
        "The saved generation record no longer matches " +
          "the displayed image. No recovery record was cleared. " +
          "Review your Image Studio history before continuing.",
      );
      return;
    }

    const cleared = clearPublishingRecovery(storage, scope);

    if (!cleared) {
      setRecoveryError(
        "Storm could not clear the completed generation " +
          "record. Try again after checking browser storage.",
      );
      return;
    }

    // The recovery record was cleared successfully.
    // Invalidate any earlier asynchronous response.
    requestVersionRef.current += 1;

    // Reset only the generator's state.
    // Do not modify the Post Editor's media selection.
    setSubmittedAssetId(null);
    setSubmittedWorkspaceId(null);
    setPendingRetry(null);

    setGenerationDetails(null);
    setGenerationStatusError("");

    setPrivatePreview(null);
    setPreviewLoading(false);
    setPreviewError("");

    setSubmissionStatus("idle");
    setSubmissionError("");

    setRecoveryError("");
    setRecoveryLoadStatus("empty");

    setStatusRefreshVersion(0);
    setPreviewRefreshVersion(0);

    // Refresh credit eligibility before another request.
    setRefreshVersion((current) => current + 1);
  }

  function refreshPrivatePreview() {
    if (
      !workspaceId ||
      !submittedAssetId ||
      submittedWorkspaceId !== workspaceId ||
      generationDetails?.assetId !== submittedAssetId ||
      generationDetails.state !== "ready" ||
      generationDetails.status !== "ready"
    ) {
      return;
    }

    setPreviewRefreshVersion((current) => current + 1);
  }

  const credits =
    creditsSnapshot?.workspaceId === workspaceId ? creditsSnapshot.value : null;

  const availableCredits = credits?.credits.available ?? null;

  const costPerImage = credits?.credits.costPerImage ?? null;

  const referencePhoto = useImageReference(
    workspaceId,
    ownerUserId,
    disabled || submissionStatus !== "idle" || recoveryLoadStatus !== "empty",
  );
  const insufficientCredits =
    credits !== null &&
    credits.credits.available < credits.credits.costPerImage;

  const dailyLimitReached =
    credits !== null &&
    credits.usage.dailyLimit != null &&
    credits.usage.attempts >= credits.usage.dailyLimit;

  const activeLimitReached =
    credits !== null &&
    credits.usage.maxActive != null &&
    credits.usage.active >= credits.usage.maxActive;

  let promptError: string | null = null;

  if (prompt.length > 0) {
    try {
      validateImagePrompt(prompt);
    } catch (error) {
      promptError =
        error instanceof Error ? error.message : "Enter a valid image prompt.";
    }
  }

  const promptValid = prompt.length > 0 && !promptError;

  const eligible =
    Boolean(workspaceId) &&
    Boolean(credits) &&
    recoveryLoadStatus === "empty" &&
    !loadingCredits &&
    !creditsError &&
    promptValid &&
    brandingValidationError === null &&
    !disabled &&
    !insufficientCredits &&
    !referencePhoto.blocked &&
    !dailyLimitReached &&
    !activeLimitReached &&
    recoveryScope;

  async function submitGenerationCommand(
    command: GenerateImageCommand,
    operation: "new" | "retry",
  ) {
    if (submissionLockRef.current || submissionStatus === "accepted") {
      return;
    }

    const scope = getCurrentRecoveryScope();
    const storage = getRecoveryStorage();

    if (!scope || !storage) {
      setRecoveryLoadStatus("blocked");
      setRecoveryError(
        "Generation recovery is unavailable. " +
          "No generation request was submitted.",
      );
      return;
    }

    // Synchronous lock prevents rapid duplicate clicks.
    submissionLockRef.current = true;

    const requestVersion = ++requestVersionRef.current;
    const requestWorkspaceId = scope.workspaceId;

    try {
      const existing = readPublishingRecovery(storage, scope);

      if (operation === "new") {
        // Do not replace an existing or unreadable
        // recovery record with a new charged operation.
        if (recoveryLoadStatus !== "empty" || existing.status !== "empty") {
          setRecoveryLoadStatus("blocked");
          setRecoveryError(
            "An existing or unverified generation " +
              "recovery record prevents a new request.",
          );
          return;
        }

        // CRITICAL:
        // Persist the original immutable command BEFORE
        // sending the first generation POST.
        const recovery = createUncertainRecovery(scope, command);

        const persisted = savePublishingRecovery(storage, scope, recovery);

        if (!persisted) {
          setRecoveryLoadStatus("blocked");
          setRecoveryError(
            "Storm could not save the generation " +
              "recovery record. No request was submitted.",
          );
          return;
        }

        setRecoveryLoadStatus("found");
      } else {
        // A retry must refer to the exact operation
        // already recorded in session storage.
        if (
          existing.status !== "found" ||
          existing.record.state !== "uncertain" ||
          JSON.stringify(existing.record.command) !== JSON.stringify(command)
        ) {
          setRecoveryLoadStatus("blocked");
          setRecoveryError(
            "The original generation request could " +
              "not be verified. No retry was submitted.",
          );
          return;
        }
      }

      setSubmissionStatus("submitting");
      setSubmissionError("");
      setRecoveryError("");

      // Only generation POST in this function.
      // Retries reuse the original command and key.
      const result = await generateWorkspaceImage(requestWorkspaceId, command);

      // Ignore responses belonging to a closed,
      // changed, or unmounted editor session.
      //
      // The pre-POST uncertain recovery record remains
      // available even if this response is discarded.
      if (requestVersion !== requestVersionRef.current) {
        return;
      }

      const acceptedRecord = createAcceptedRecovery(scope, result.assetId);

      // Persist accepted asset identity BEFORE updating
      // the UI or beginning status tracking.
      const savedAccepted = savePublishingRecovery(
        storage,
        scope,
        acceptedRecord,
      );

      if (!savedAccepted) {
        // The original uncertain record is retained
        // by the recovery utility's failed write.
        //
        // Do not discard the immutable command.
        setPendingRetry(command);
        setSubmissionStatus("uncertain");

        setSubmissionError(
          "The backend accepted this generation, but " +
            "Storm could not persist its asset ID. " +
            "Check the original request before continuing.",
        );

        setRefreshVersion((current) => current + 1);
        return;
      }

      setSubmittedWorkspaceId(requestWorkspaceId);
      setSubmittedAssetId(result.assetId);

      setPendingRetry(null);
      setGenerationDetails(null);
      setGenerationStatusError("");

      setSubmissionStatus("accepted");

      // Refresh the balance after backend admission.
      setRefreshVersion((current) => current + 1);
    } catch (error) {
      if (requestVersion !== requestVersionRef.current) {
        return;
      }

      // The original record already exists.
      // Preserve the same key and payload.
      setPendingRetry(command);
      setSubmissionStatus("uncertain");

      setSubmissionError(
        error instanceof Error
          ? error.message
          : "Storm could not confirm the generation request.",
      );

      setRefreshVersion((current) => current + 1);
    } finally {
      submissionLockRef.current = false;
    }
  }

  function handleGenerate() {
    if (
      !eligible ||
      disabled ||
      recoveryLoadStatus !== "empty" ||
      submissionStatus !== "idle" ||
      submissionLockRef.current ||
      !workspaceId ||
      !ownerUserId
    ) {
      return;
    }

    try {
      let command: GenerateImageCommand;

      try {
        // Revalidate the latest editor values immediately
        // before constructing a credit-bearing request.
        const branding = createPublishingImageBranding(
          brandingSettings,
          logoVerified,
        );

        command = snapshotImageGenerationCommand({
          idempotencyKey: createImageRequestKey(),
          image: {
            prompt,
            aspectRatio,
            branding,
            ...(referencePhoto.reference
              ? { reference: referencePhoto.reference }
              : {}),
          },
        });
      } catch (error) {
        setSubmissionError(
          error instanceof Error
            ? error.message
            : "Invalid image branding settings.",
        );

        return;
      }

      // Reset presentation before submitting the one immutable command.
      setPendingRetry(null);
      setSubmittedAssetId(null);
      setSubmissionError("");

      setSubmittedWorkspaceId(null);
      setGenerationDetails(null);
      setGenerationStatusError("");

      setPrivatePreview(null);
      setPreviewLoading(false);
      setPreviewError("");
      setPreviewRefreshVersion(0);

      void submitGenerationCommand(command, "new");
    } catch (error) {
      setSubmissionError(
        error instanceof Error
          ? error.message
          : "Invalid image generation settings.",
      );
    }
  }

  function handleRetryOriginalRequest() {
    if (
      !workspaceId ||
      !pendingRetry ||
      submissionStatus !== "uncertain" ||
      submissionLockRef.current
    ) {
      return;
    }

    // Reuse the immutable original payload.
    // Do not call createImageRequestKey() again.
    void submitGenerationCommand(pendingRetry, "retry");
  }

  return (
    <section aria-label="AI image generation settings" className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Available credits</p>

          <p className="mt-1 text-xl font-bold text-slate-900">
            {loadingCredits ? "..." : (availableCredits ?? "—")}
          </p>
        </div>

        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Cost per image</p>

          <p className="mt-1 text-xl font-bold text-slate-900">
            {costPerImage ?? "—"}
          </p>
        </div>

        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Daily usage (UTC)</p>

          <p className="mt-1 text-xl font-bold text-slate-900">
            {credits
              ? `${credits.usage.attempts} / ${credits.usage.dailyLimit ?? "Unlimited"}`
              : "—"}
          </p>
        </div>
      </div>

      <button
        type="button"
        disabled={!workspaceId || loadingCredits}
        onClick={() => setRefreshVersion((current) => current + 1)}
        className="text-xs font-semibold text-violet-700 underline disabled:opacity-50"
      >
        Refresh credits
      </button>

      {creditsError && (
        <p role="alert" className="text-sm text-rose-700">
          {creditsError}
        </p>
      )}

      <ImageReferenceInput
        key={referencePhoto.scope}
        {...referencePhoto.fieldProps}
      />
      <div className="space-y-2">
        <label
          htmlFor="publishing-image-prompt"
          className="block text-sm font-semibold text-slate-800"
        >
          Image prompt
        </label>

        <textarea
          id="publishing-image-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          disabled={!workspaceId}
          maxLength={3000}
          rows={5}
          placeholder="Describe the subject, lighting, composition, and visual style..."
          className="w-full resize-y rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-violet-500 disabled:opacity-50"
        />

        <div className="flex justify-between gap-2 text-xs text-slate-500">
          <span>Describe the image you want to create.</span>
          <span>{prompt.length}/3000</span>
        </div>

        {promptError && (
          <p role="alert" className="text-xs text-rose-700">
            {promptError}
          </p>
        )}
      </div>

      <fieldset disabled={!workspaceId} className="space-y-3">
        <legend className="text-sm font-semibold text-slate-800">
          Aspect ratio
        </legend>

        <div className="grid grid-cols-3 gap-2">
          {ASPECT_RATIOS.map((option) => (
            <label
              key={option.value}
              className={`cursor-pointer rounded-xl border p-3 text-center ${
                aspectRatio === option.value
                  ? "border-violet-500 bg-violet-50"
                  : "border-slate-200"
              }`}
            >
              <input
                type="radio"
                name="publishing-image-aspect-ratio"
                value={option.value}
                checked={aspectRatio === option.value}
                onChange={() => setAspectRatio(option.value)}
                className="sr-only"
              />

              <span className="block text-xs font-semibold">
                {option.label}
              </span>

              <span className="text-xs text-slate-500">
                {option.dimensions}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {!disabled &&
        (submissionStatus !== "idle" || recoveryLoadStatus !== "empty") && (
          <p
            role="status"
            className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
          >
            {recoveryLoadStatus === "checking"
              ? "Checking for a previous image-generation request."
              : submissionStatus === "accepted"
                ? "An image-generation request is active. Branding settings will unlock when you finish the current generation."
                : submissionStatus === "uncertain"
                  ? "Verify the previous generation request before creating another image."
                  : "Image-generation recovery must be resolved before changing branding settings."}
          </p>
        )}

      <PublishingImageBrandingFields
        key={`${ownerUserId ?? "no-user"}:${workspaceId ?? "no-workspace"}`}
        workspaceId={workspaceId}
        aspectRatio={aspectRatio}
        value={brandingSettings}
        onLogoAvailabilityChange={handleLogoAvailabilityChange}
        onChange={setBrandingSettings}
        disabled={
          disabled ||
          submissionStatus !== "idle" ||
          recoveryLoadStatus !== "empty"
        }
      />

      {insufficientCredits && (
        <p role="alert" className="text-sm text-amber-800">
          Your workspace does not have enough credits for another image.
        </p>
      )}

      {(dailyLimitReached || activeLimitReached) && (
        <p role="status" className="text-sm text-amber-800">
          Your workspace has reached an image generation limit. Review the usage
          information before retrying.
        </p>
      )}

      <div
        role="status"
        className="rounded-xl border border-slate-200 bg-slate-50 p-4"
      >
        <p className="text-sm font-semibold text-slate-900">
          {eligible
            ? "Generation settings ready"
            : "Generation settings incomplete"}
        </p>

        <p className="mt-1 text-xs leading-5 text-slate-600">
          {eligible
            ? "You can generate an image using your workspace credits."
            : recoveryLoadStatus === "found"
              ? "Finish or recover the current generation before starting another."
              : "Complete the generation settings and verify your workspace credits."}
        </p>
      </div>

      <div className="space-y-3 border-t border-slate-200 pt-5">
        {submissionStatus === "idle" && (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!eligible}
            className="w-full rounded-xl bg-violet-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Generate image · {costPerImage ?? "—"} credit
            {costPerImage === 1 ? "" : "s"}
          </button>
        )}

        {submissionStatus === "submitting" && (
          <p role="status" className="text-sm text-violet-700">
            Submitting image generation request...
          </p>
        )}

        {submissionStatus === "accepted" && submittedAssetId && (
          <div
            role="status"
            className="rounded-xl border border-violet-200 bg-violet-50 p-4"
          >
            <p className="text-sm font-semibold text-violet-900">
              Generation request accepted
            </p>

            <p className="mt-2 text-xs text-violet-800">
              Storm has registered your image-generation request. We will add
              status tracking and image previews in the next checkpoint.
            </p>

            <p className="mt-2 break-all text-xs text-violet-700">
              Asset ID: {submittedAssetId}
            </p>
          </div>
        )}

        {recoveryLoadStatus === "checking" && (
          <p role="status" className="text-xs text-slate-600">
            Checking for an existing generation...
          </p>
        )}

        {recoveryLoadStatus === "blocked" && (
          <div
            role="alert"
            className="rounded-xl border border-amber-200 bg-amber-50 p-4"
          >
            <p className="text-sm font-semibold text-amber-900">
              Generation recovery requires attention
            </p>

            <p className="mt-2 text-xs leading-5 text-amber-800">
              {recoveryError}
            </p>

            <p className="mt-2 text-xs text-amber-800">
              Check Image Studio and the workspace's existing generations before
              attempting another request.
            </p>
          </div>
        )}

        {recoveryError && recoveryLoadStatus !== "blocked" && (
          <p role="alert" className="text-sm text-rose-700">
            {recoveryError}
          </p>
        )}

        {generationDetails?.state === "ready" &&
          generationDetails.status === "ready" &&
          generationDetails.assetId === submittedAssetId && (
            <section
              aria-label="Generated image private preview"
              className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-white p-4"
            >
              <h4 className="text-sm font-semibold text-slate-900">
                Generated image preview
              </h4>

              {previewLoading && (
                <p role="status" className="text-xs text-slate-600">
                  Loading private image preview...
                </p>
              )}

              {visiblePreview && (
                <div className="overflow-hidden rounded-xl bg-slate-100">
                  <img
                    src={visiblePreview.url}
                    alt="AI-generated image preview"
                    referrerPolicy="no-referrer"
                    className="max-h-[420px] w-full object-contain"
                    onError={() => {
                      setPrivatePreview(null);
                      setPreviewError(
                        "The private image link expired or " +
                          "could not be loaded. Refresh the preview.",
                      );
                    }}
                  />
                </div>
              )}

              {generationDetails.image && (
                <p className="text-xs text-slate-500">
                  {generationDetails.image.width} ×{" "}
                  {generationDetails.image.height} · PNG
                </p>
              )}

              {previewError && (
                <p role="alert" className="text-xs text-rose-700">
                  {previewError}
                </p>
              )}

              <button
                type="button"
                disabled={previewLoading}
                onClick={refreshPrivatePreview}
                className="rounded-lg border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
              >
                Refresh private preview
              </button>

              {onUseImage && (
                <button
                  type="button"
                  onClick={handleUseGeneratedImage}
                  disabled={!canUseGeneratedImage}
                  className="w-full rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Use This Image
                </button>
              )}

              {generationDetails?.state === "ready" &&
                generationDetails.status === "ready" &&
                generationDetails.assetId === submittedAssetId &&
                visiblePreview && (
                  <div className="space-y-2 border-t border-slate-200 pt-4">
                    <button
                      type="button"
                      onClick={handleFinishGeneration}
                      disabled={
                        disabled ||
                        recoveryLoadStatus !== "found" ||
                        previewLoading
                      }
                      className="w-full rounded-xl border border-violet-300 bg-white px-4 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Finish Image & Generate Another
                    </button>

                    <p className="text-xs leading-5 text-slate-500">
                      This finishes recovery for the current image and lets you
                      generate another. The image remains in your Media Library,
                      and any image already selected for this draft remains
                      unchanged.
                    </p>
                  </div>
                )}

              <p className="text-xs leading-5 text-slate-500">
                Images are stored privately. Preview links expire and can be
                refreshed without generating another image.
              </p>
            </section>
          )}

        {generationDetails?.state === "processing" && (
          <ImageGenerationProgress progress={generationDetails.progress} />
        )}

        {generationDetails?.state === "ready" &&
          generationDetails.status === "ready" && (
            <p
              role="status"
              className="mt-3 text-sm font-semibold text-emerald-800"
            >
              Your image is ready. Private preview and attachment are next.
            </p>
          )}

        {generationDetails?.state === "failed" && (
          <p role="alert" className="mt-3 text-sm text-rose-800">
            Image generation failed. Check Image Studio for the recorded
            outcome.
          </p>
        )}

        {generationDetails?.state === "action_required" && (
          <p role="alert" className="mt-3 text-sm text-amber-900">
            {generationDetails.message ??
              "This generation requires recovery or review. Do not create another generation to retry it."}
          </p>
        )}

        {generationStatusError && (
          <div className="mt-3 space-y-2">
            <p role="alert" className="text-xs text-rose-700">
              {generationStatusError}
            </p>

            <button
              type="button"
              onClick={() => {
                setGenerationStatusError("");
                setGenerationDetails(null);
                setStatusRefreshVersion((current) => current + 1);
              }}
              className="text-xs font-semibold text-violet-700 underline"
            >
              Refresh generation status
            </button>
          </div>
        )}

        {submissionStatus === "uncertain" && (
          <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p role="alert" className="text-sm font-semibold text-amber-900">
              Generation request requires verification
            </p>

            <p className="text-xs leading-5 text-amber-800">
              {submissionError}
            </p>

            <p className="text-xs leading-5 text-amber-800">
              The request may already have been accepted. Do not start a
              different generation until this request has been checked.
            </p>

            <button
              type="button"
              onClick={handleRetryOriginalRequest}
              disabled={!pendingRetry}
              className="rounded-lg bg-amber-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              Check / retry original request
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
