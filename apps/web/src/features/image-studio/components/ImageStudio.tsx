import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  createImageRequestKey,
  generateWorkspaceImage,
  getImageGenerationCredits,
  getWorkspaceImageStatus,
  getWorkspaceImageUrl,
  validateImagePrompt,
  type GenerateImageCommand,
  type ImageAspectRatio,
  type ImageGenerationCredits,
  type ImageGenerationDetails,
} from "@/lib/imageGeneration";

import { ImageHistoryGallery } from "./ImageHistoryGallery";

type ImageStudioProps = {
  selectedWorkspaceId: string | null;
};

const ASPECT_RATIOS: Array<{
  value: ImageAspectRatio;
  label: string;
  description: string;
}> = [
  {
    value: "square",
    label: "Square",
    description: "1:1",
  },
  {
    value: "portrait",
    label: "Portrait",
    description: "2:3",
  },
  {
    value: "landscape",
    label: "Landscape",
    description: "3:2",
  },
];

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

export function ImageStudio({ selectedWorkspaceId }: ImageStudioProps) {
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>("square");

  const [credits, setCredits] = useState<ImageGenerationCredits | null>(null);

  const [loadingCredits, setLoadingCredits] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  const [details, setDetails] = useState<ImageGenerationDetails | null>(null);

  const [assetId, setAssetId] = useState<string | null>(null);

  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [creditsError, setCreditsError] = useState("");
  const [previewError, setPreviewError] = useState("");

  const [pendingRetry, setPendingRetry] = useState<GenerateImageCommand | null>(
    null,
  );

  // Invalidate results from requests associated
  // with an earlier workspace or generation.
  const generationRef = useRef(0);

  // Remount when the selected workspace changes
  // (the parent supplies a workspace-specific key).
  useEffect(() => {
    if (!selectedWorkspaceId) {
      setCredits(null);
      return;
    }

    let active = true;

    setLoadingCredits(true);
    setCreditsError("");

    void getImageGenerationCredits(selectedWorkspaceId)
      .then((value) => {
        if (active) setCredits(value);
      })
      .catch((cause: unknown) => {
        if (active) {
          setCredits(null);
          setCreditsError(errorMessage(cause));
        }
      })
      .finally(() => {
        if (active) setLoadingCredits(false);
      });

    return () => {
      active = false;
    };
  }, [selectedWorkspaceId]);

  async function refreshCredits() {
    if (!selectedWorkspaceId) return;

    try {
      const value = await getImageGenerationCredits(selectedWorkspaceId);

      setCredits(value);
      setCreditsError("");
    } catch (cause) {
      setCreditsError(errorMessage(cause));
    }
  }

  async function refreshStatus(id: string, version = generationRef.current) {
    if (!selectedWorkspaceId) return;

    const next = await getWorkspaceImageStatus(selectedWorkspaceId, id);

    if (version !== generationRef.current) return;

    setDetails(next);

    if (next.status === "ready") {
      const access = await getWorkspaceImageUrl(selectedWorkspaceId, id);

      if (version !== generationRef.current) return;

      setImageUrl(access.url);
      setPreviewError("");
    }

    if (next.status === "failed") {
      setImageUrl(null);
    }

    return next;
  }

  // Poll only an already-known pending operation.
  // Never repeat the generation POST while polling.
  useEffect(() => {
    if (!selectedWorkspaceId || !assetId || details?.state !== "processing") {
      return;
    }

    let active = true;
    let inFlight = false;

    const interval = window.setInterval(() => {
      if (!active || inFlight) return;

      inFlight = true;

      void refreshStatus(assetId)
        .catch((cause: unknown) => {
          if (active) {
            setError(
              `Unable to refresh generation status: ${errorMessage(cause)}`,
            );
          }
        })
        .finally(() => {
          inFlight = false;
        });
    }, 4000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [selectedWorkspaceId, assetId, details?.state]);

  async function submitCommand(command: GenerateImageCommand) {
    if (!selectedWorkspaceId || submitting) return;

    const version = ++generationRef.current;

    setSubmitting(true);
    setError("");

    try {
      const submitted = await generateWorkspaceImage(
        selectedWorkspaceId,
        command,
      );

      if (version !== generationRef.current) return;

      setAssetId(submitted.assetId);
      setPendingRetry(null);

      // Refresh even if the POST returned ready:
      // the GET endpoint supplies the safe
      // image metadata and readiness state.
      await refreshStatus(submitted.assetId, version);

      await refreshCredits();
    } catch (cause) {
      if (version !== generationRef.current) return;

      // Preserve the exact key and image settings.
      // A retry of an ambiguous POST must not
      // become a new credit-charged request.
      setPendingRetry(command);

      setError(errorMessage(cause));
      await refreshCredits();
    } finally {
      if (version === generationRef.current) {
        setSubmitting(false);
      }
    }
  }

  function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedWorkspaceId || submitting) return;

    try {
      const normalizedPrompt = validateImagePrompt(prompt);

      const command: GenerateImageCommand = {
        idempotencyKey: createImageRequestKey(),
        image: {
          prompt: normalizedPrompt,
          aspectRatio,
        },
      };

      // From this point, the command is immutable
      // for all retries of this logical request.
      setPendingRetry(null);
      setAssetId(null);
      setDetails(null);
      setImageUrl(null);
      setPreviewError("");
      setError("");

      void submitCommand(command);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function refreshPreview() {
    if (!selectedWorkspaceId || !assetId) return;

    try {
      const access = await getWorkspaceImageUrl(selectedWorkspaceId, assetId);

      setImageUrl(access.url);
      setPreviewError("");
    } catch (cause) {
      setPreviewError(errorMessage(cause));
    }
  }

  const availableCredits = credits?.credits.available;
  const costPerImage = credits?.credits.costPerImage;

  const insufficientCredits =
    availableCredits !== undefined &&
    costPerImage !== undefined &&
    availableCredits < costPerImage;

  const dailyLimitReached =
    credits !== null && credits.usage.attempts >= credits.usage.dailyLimit;

  const activeLimitReached =
    credits !== null && credits.usage.active >= credits.usage.maxActive;

  const cannotGenerate =
    !selectedWorkspaceId ||
    submitting ||
    pendingRetry !== null ||
    details?.state === "processing" ||
    details?.state === "action_required" ||
    !credits ||
    insufficientCredits ||
    dailyLimitReached ||
    activeLimitReached ||
    prompt.trim().length < 10 ||
    prompt.trim().length > 3000;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-violet-600">
          AI Media
        </p>
        <h1 className="text-2xl font-bold text-slate-900">Image Studio</h1>
        <p className="text-sm text-slate-600">
          Create images using your Storm credits. Generated files are stored
          privately.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Available credits</p>
          <p className="mt-2 text-3xl font-bold">
            {loadingCredits ? "..." : (availableCredits ?? "—")}
          </p>
          <button
            type="button"
            onClick={() => void refreshCredits()}
            disabled={!selectedWorkspaceId}
            className="mt-3 text-sm font-medium text-violet-700 hover:underline"
          >
            Refresh balance
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Cost per image</p>
          <p className="mt-2 text-3xl font-bold">{costPerImage ?? "—"}</p>
          <p className="mt-1 text-xs text-slate-500">Storm credits</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Today's usage (UTC)</p>
          <p className="mt-2 text-3xl font-bold">
            {credits
              ? `${credits.usage.attempts}/${credits.usage.dailyLimit}`
              : "—"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Active operations:{" "}
            {credits
              ? `${credits.usage.active}/${credits.usage.maxActive}`
              : "—"}
          </p>
        </div>
      </section>

      {creditsError && (
        <p role="alert" className="text-sm text-red-700">
          Unable to load credits: {creditsError}
        </p>
      )}

      {!selectedWorkspaceId && (
        <p
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
        >
          Select a workspace to use Image Studio.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={handleGenerate}
          className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5"
        >
          <div className="space-y-2">
            <label
              htmlFor="image-studio-prompt"
              className="text-sm font-semibold text-slate-800"
            >
              Image prompt
            </label>
            <textarea
              id="image-studio-prompt"
              rows={7}
              maxLength={3000}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe the image, subject, lighting, composition, and style..."
              className="w-full resize-y rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-violet-500"
            />
            <p className="text-right text-xs text-slate-500">
              {prompt.length}/3000
            </p>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-slate-800">
              Aspect ratio
            </legend>

            <div className="grid grid-cols-3 gap-2">
              {ASPECT_RATIOS.map((item) => {
                const selected = aspectRatio === item.value;

                return (
                  <label
                    key={item.value}
                    className={`cursor-pointer rounded-xl border p-3 text-center ${
                      selected
                        ? "border-violet-500 bg-violet-50"
                        : "border-slate-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name="aspectRatio"
                      value={item.value}
                      checked={selected}
                      onChange={() => setAspectRatio(item.value)}
                      className="sr-only"
                    />
                    <span className="block text-sm font-medium">
                      {item.label}
                    </span>
                    <span className="text-xs text-slate-500">
                      {item.description}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {insufficientCredits && (
            <p role="alert" className="text-sm text-amber-700">
              You don't have enough credits to generate another image.
            </p>
          )}

          {(dailyLimitReached || activeLimitReached) && (
            <p role="status" className="text-sm text-amber-700">
              Your workspace has reached a generation limit. Check the usage
              summary above.
            </p>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={cannotGenerate}
            className="w-full rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting
              ? "Generating..."
              : `Generate image · ${costPerImage ?? "—"} credit${costPerImage === 1 ? "" : "s"}`}
          </button>

          {pendingRetry && (
            <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs text-amber-800">
                The previous request may already have been accepted. Retry the
                same request without generating a new key.
              </p>
              <button
                type="button"
                onClick={() => void submitCommand(pendingRetry)}
                disabled={submitting}
                className="text-sm font-semibold text-amber-900 underline disabled:opacity-50"
              >
                Check / retry original request
              </button>
            </div>
          )}

          <p className="text-xs text-slate-500">
            The backend validates credits and limits again before admitting any
            generation.
          </p>
        </form>

        <section
          aria-label="Generated image preview"
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-slate-900">Preview</h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
              {details?.state ?? "No image"}
            </span>
          </div>

          <div className="flex min-h-72 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
            {imageUrl && details?.status === "ready" ? (
              <img
                src={imageUrl}
                alt="Generated image"
                referrerPolicy="no-referrer"
                onError={() =>
                  setPreviewError(
                    "The private image link expired or could not be loaded.",
                  )
                }
                className="max-h-[480px] w-full object-contain"
              />
            ) : details?.state === "processing" ? (
              <p
                role="status"
                className="p-5 text-center text-sm text-slate-600"
              >
                Processing image generation...
              </p>
            ) : details?.state === "action_required" ? (
              <p
                role="status"
                className="p-5 text-center text-sm text-amber-800"
              >
                This generation requires recovery. No additional generation will
                be started automatically.
              </p>
            ) : details?.status === "failed" ? (
              <p role="status" className="p-5 text-center text-sm text-red-700">
                Generation failed.
              </p>
            ) : (
              <p className="p-5 text-center text-sm text-slate-500">
                Your generated image will appear here.
              </p>
            )}
          </div>

          {previewError && (
            <p role="alert" className="text-sm text-red-700">
              {previewError}
            </p>
          )}

          {assetId && (
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() =>
                  void refreshStatus(assetId).catch((cause: unknown) =>
                    setError(errorMessage(cause)),
                  )
                }
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium"
              >
                Refresh status
              </button>

              {details?.status === "ready" && (
                <button
                  type="button"
                  onClick={() => void refreshPreview()}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium"
                >
                  Refresh image link
                </button>
              )}
            </div>
          )}

          {details?.image && (
            <p className="text-xs text-slate-500">
              {details.image.width} × {details.image.height} · PNG
            </p>
          )}

          {details?.status === "ready" || details?.status === "failed" ? (
            <p className="text-xs text-slate-500">
              You can create another image using the prompt editor when your
              credit balance and workspace limits allow it.
            </p>
          ) : null}
        </section>
      </div>

      <ImageHistoryGallery
        key={selectedWorkspaceId ?? "no-workspace"}
        selectedWorkspaceId={selectedWorkspaceId}
        refreshKey={assetId}
      />
    </main>
  );
}
