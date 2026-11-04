import type { ComponentProps } from "react";

import FacebookOAuthSessionLoader from "@/components/facebook/FacebookOAuthSessionLoader";

type FacebookOAuthConnectedHandler = ComponentProps<
  typeof FacebookOAuthSessionLoader
>["onConnected"];

type CallbackWorkspace = {
  _id: string;
  name: string;
};

type FacebookOAuthCallbackPanelProps = {
  workspaceId: string | null;
  workspace: CallbackWorkspace | null | undefined;
  workspacesLoading: boolean;
  workspaceError: string | null | undefined;
  onConnected: FacebookOAuthConnectedHandler;
  onClose: () => void;
};

/**
 * Presentation component for the Facebook
 * OAuth Page-selection callback.
 *
 * Responsibilities:
 * - Display authorization instructions
 * - Display workspace validation states
 * - Render the existing Page-selection loader
 * - Forward close and completion events
 *
 * This component does not:
 * - Read or modify OAuth URL parameters
 * - Change the active workspace
 * - Make direct API requests
 * - Refresh connection state
 * - Handle access tokens
 */
export function FacebookOAuthCallbackPanel({
  workspaceId,
  workspace,
  workspacesLoading,
  workspaceError,
  onConnected,
  onClose,
}: FacebookOAuthCallbackPanelProps) {
  return (
    <section
      aria-label="Facebook account authorization"
      className="mb-6 rounded-xl border border-blue-200 bg-blue-50/50 p-4 sm:p-6"
    >
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
          Facebook Authorization
        </p>

        <h2 className="mt-1 text-xl font-semibold text-slate-900">
          Finish Connecting Facebook
        </h2>

        <p className="mt-2 text-sm text-slate-600">
          Select the Facebook Pages you want to connect to your Storm workspace.
        </p>
      </div>

      {workspacesLoading ? (
        <div
          role="status"
          className="rounded-lg bg-white p-4 text-sm text-slate-600"
        >
          Checking your workspace...
        </div>
      ) : !workspaceId ? (
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-white p-4"
        >
          <p className="text-sm text-amber-800">
            Storm could not identify the workspace that initiated Facebook
            authorization. Please start the Facebook connection again.
          </p>

          <button
            type="button"
            onClick={onClose}
            className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      ) : !workspace ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-white p-4"
        >
          <p className="text-sm text-red-700">
            The workspace that initiated Facebook authorization is no longer
            available to your account.
          </p>

          {workspaceError && (
            <p className="mt-2 text-sm text-red-600">{workspaceError}</p>
          )}

          <button
            type="button"
            onClick={onClose}
            className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-blue-100 bg-white px-4 py-3">
            <p className="text-xs text-slate-500">
              Connecting Pages to workspace
            </p>

            <p className="mt-1 text-sm font-semibold text-slate-900">
              {workspace.name}
            </p>
          </div>

          <FacebookOAuthSessionLoader
            workspaceId={workspaceId}
            onConnected={onConnected}
            onClose={onClose}
          />
        </div>
      )}
    </section>
  );
}
