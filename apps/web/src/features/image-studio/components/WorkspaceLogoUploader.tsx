import { useState, type ChangeEvent } from "react";

import { enableWorkspaceLogo, uploadWorkspaceLogo } from "@/lib/workspaceLogo";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [needsEnable, setNeedsEnable] = useState(false);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];

    // Allow selecting the same filename again.
    event.currentTarget.value = "";

    if (!file || !workspaceId || busy || disabled) {
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");
    setNeedsEnable(false);

    let uploadConfirmed = false;

    try {
      await uploadWorkspaceLogo(workspaceId, file);

      uploadConfirmed = true;
      setNeedsEnable(true);

      await enableWorkspaceLogo(workspaceId);

      setNeedsEnable(false);
      setSuccess("Workspace logo uploaded and enabled.");
      onReady();
    } catch (cause) {
      if (uploadConfirmed) {
        setError(
          "Logo uploaded, but enabling it failed. " +
            "Use Retry enable instead of uploading again. " +
            errorMessage(cause),
        );
      } else {
        setError(
          "Logo upload could not be confirmed. " +
            "Check the workspace logo before retrying. " +
            errorMessage(cause),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleRetryEnable() {
    if (!workspaceId || busy || disabled) return;

    setBusy(true);
    setError("");

    try {
      await enableWorkspaceLogo(workspaceId);
      setNeedsEnable(false);
      setSuccess("Workspace logo enabled.");
      onReady();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
      <div>
        <p className="text-sm font-semibold text-slate-800">Workspace logo</p>

        <p className="mt-1 text-xs text-slate-600">
          Upload or replace the logo used for image branding. PNG, JPEG, or
          WebP. Maximum 5 MB.
        </p>

        <p className="mt-1 text-xs text-slate-500">
          Transparent PNG is recommended.
        </p>
      </div>

      <label
        htmlFor="image-studio-logo-upload"
        className="block text-sm font-medium text-slate-700"
      >
        Choose logo file
      </label>

      <input
        id="image-studio-logo-upload"
        aria-label="Upload workspace logo"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={!workspaceId || busy || disabled}
        onChange={(event) => void handleFileChange(event)}
        className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-100 file:px-4 file:py-2 file:font-medium file:text-violet-800 disabled:opacity-50"
      />

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
