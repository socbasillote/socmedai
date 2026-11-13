import { useEffect, useRef, useState, type ChangeEvent } from "react";

import {
  enableWorkspaceLogo,
  getWorkspaceLogo,
  getWorkspaceLogoPreview,
  uploadWorkspaceLogo,
  type WorkspaceLogoSettings,
} from "@/lib/workspaceLogo";

type Props = {
  workspaceId: string | null;
  disabled?: boolean;
  onReady: () => void;
};

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unable to update the workspace logo.";
}

export function WorkspaceLogoUploader({
  workspaceId,
  disabled = false,
  onReady,
}: Props) {
  const [settings, setSettings] = useState<WorkspaceLogoSettings | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [error, setError] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [success, setSuccess] = useState("");

  const [needsEnable, setNeedsEnable] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const hasLogo = Boolean(settings?.logo);
  const isEnabled = Boolean(settings?.enabled && settings.logo);

  const previewRequestRef = useRef(0);

  // Load the persisted logo when Image Studio opens.
  // Invalidate responses after a workspace change
  // or a newer refresh request.
  useEffect(() => {
    const previewRequestId = ++previewRequestRef.current;
    if (!workspaceId) {
      setSettings(null);
      setPreviewUrl(null);
      setLoading(false);
      return;
    }

    let active = true;

    setLoading(true);
    setPreviewError("");
    setPreviewUrl(null);

    async function loadLogo() {
      if (!workspaceId) return;

      try {
        const current = await getWorkspaceLogo(workspaceId);

        if (!active) return;

        setSettings(current);

        if (!current.logo) {
          setPreviewUrl(null);
          return;
        }

        try {
          const preview = await getWorkspaceLogoPreview(workspaceId);

          if (!active || previewRequestId !== previewRequestRef.current) {
            return;
          }

          setPreviewUrl(preview.url);
        } catch {
          if (!active || previewRequestId !== previewRequestRef.current) {
            return;
          }

          setPreviewError("Logo preview is unavailable. Try refreshing it.");
        }
      } catch {
        if (!active) return;

        setSettings(null);
        setPreviewError("Unable to load the saved workspace logo.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadLogo();

    return () => {
      active = false;
      previewRequestRef.current += 1;
    };
  }, [workspaceId, refreshVersion]);

  function refreshSavedLogo() {
    setRefreshVersion((version) => version + 1);
  }

  async function refreshPreview() {
    if (!workspaceId || !hasLogo) return;

    const requestId = ++previewRequestRef.current;

    setPreviewError("");

    try {
      const result = await getWorkspaceLogoPreview(workspaceId);

      // Only the newest preview request may
      // update the displayed image.
      if (requestId !== previewRequestRef.current) {
        return;
      }

      setPreviewUrl(result.url);
    } catch {
      if (requestId !== previewRequestRef.current) {
        return;
      }

      setPreviewUrl(null);
      setPreviewError("Unable to refresh the private logo preview.");
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];

    // Allow the same file to be selected again.
    event.currentTarget.value = "";

    if (!file || !workspaceId || busy || disabled) {
      return;
    }

    previewRequestRef.current += 1;

    setBusy(true);
    setError("");
    setSuccess("");
    setNeedsEnable(false);

    let uploadConfirmed = false;

    try {
      const uploaded = await uploadWorkspaceLogo(workspaceId, file);

      uploadConfirmed = true;
      setSettings(uploaded);
      setNeedsEnable(!uploaded.enabled);

      const enabled = uploaded.enabled
        ? uploaded
        : await enableWorkspaceLogo(workspaceId);

      setSettings(enabled);
      setNeedsEnable(false);

      setSuccess("Workspace logo saved and enabled.");

      refreshSavedLogo();
      onReady();
    } catch (cause) {
      if (uploadConfirmed) {
        setError(
          "Logo uploaded, but enabling it failed. " +
            "Use Retry enable. " +
            errorMessage(cause),
        );
      } else {
        setError(
          "Logo upload could not be confirmed. " +
            "Check the workspace logo before uploading again. " +
            errorMessage(cause),
        );
      }

      refreshSavedLogo();
    } finally {
      setBusy(false);
    }
  }

  async function handleRetryEnable() {
    if (!workspaceId || busy || disabled) return;

    setBusy(true);
    setError("");

    try {
      const enabled = await enableWorkspaceLogo(workspaceId);

      setSettings(enabled);
      setNeedsEnable(false);
      setSuccess("Workspace logo enabled.");

      refreshSavedLogo();
      onReady();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">Workspace logo</h3>

        <span
          className={`rounded-full px-2 py-1 text-xs font-medium ${
            isEnabled
              ? "bg-green-100 text-green-800"
              : "bg-slate-200 text-slate-700"
          }`}
        >
          {loading
            ? "Checking..."
            : isEnabled
              ? "Enabled"
              : hasLogo
                ? "Not enabled"
                : "No logo"}
        </span>
      </div>

      {loading ? (
        <p role="status" className="text-sm text-slate-600">
          Loading workspace logo...
        </p>
      ) : hasLogo ? (
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-2">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Current workspace logo"
                referrerPolicy="no-referrer"
                className="max-h-full max-w-full object-contain"
                onError={() => {
                  setPreviewUrl(null);
                  setPreviewError("Logo link expired or could not be loaded.");
                }}
              />
            ) : (
              <span className="text-center text-xs text-slate-500">
                Preview unavailable
              </span>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-800">
              Saved workspace logo
            </p>

            <p className="text-xs text-slate-600">Stored privately as PNG.</p>

            <button
              type="button"
              onClick={() => void refreshPreview()}
              disabled={busy || disabled}
              className="text-xs font-medium text-violet-700 underline disabled:opacity-50"
            >
              Refresh preview
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          Upload a logo to personalize generated images.
        </p>
      )}

      {previewError && (
        <p role="alert" className="text-xs text-amber-800">
          {previewError}
        </p>
      )}

      <div className="space-y-2">
        <label
          htmlFor="image-studio-logo-upload"
          className="block text-sm font-medium text-slate-700"
        >
          {hasLogo ? "Replace logo" : "Upload logo"}
        </label>

        <input
          id="image-studio-logo-upload"
          aria-label={
            hasLogo ? "Replace workspace logo" : "Upload workspace logo"
          }
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={!workspaceId || loading || busy || disabled}
          onChange={(event) => void handleFileChange(event)}
          className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-100 file:px-4 file:py-2 file:font-medium file:text-violet-800 disabled:opacity-50"
        />

        <p className="text-xs text-slate-500">
          PNG, JPEG, or WebP. Maximum 5 MB. Transparent PNG recommended.
        </p>
      </div>

      {busy && (
        <p role="status" className="text-sm text-slate-600">
          Saving workspace logo...
        </p>
      )}

      {success && (
        <p role="status" className="text-sm text-green-700">
          {success}
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      {needsEnable && (
        <button
          type="button"
          disabled={busy || disabled}
          onClick={() => void handleRetryEnable()}
          className="rounded-lg border border-violet-300 px-3 py-2 text-sm font-medium text-violet-800 disabled:opacity-50"
        >
          Retry enable
        </button>
      )}
    </div>
  );
}
