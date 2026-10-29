import { useEffect, useState } from "react";

import {
  getFacebookOAuthSession,
  type FacebookOAuthSession,
  type FacebookPageConnection,
} from "../../lib/facebookApi";

import FacebookPageSelector from "./FacebookPageSelector";

type FacebookOAuthSessionLoaderProps = {
  workspaceId: string;
  onConnected?: (connections: FacebookPageConnection[]) => void;
  onClose?: () => void;
};

type SessionState =
  | {
      status: "loading";
    }
  | {
      status: "success";
      session: FacebookOAuthSession;
    }
  | {
      status: "error";
      message: string;
    };

export default function FacebookOAuthSessionLoader({
  workspaceId,
  onConnected,
  onClose,
}: FacebookOAuthSessionLoaderProps) {
  const [sessionState, setSessionState] = useState<SessionState>({
    status: "loading",
  });

  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      setSessionState({
        status: "loading",
      });

      try {
        const session = await getFacebookOAuthSession(workspaceId);

        if (cancelled) {
          return;
        }

        if (session.workspaceId !== workspaceId) {
          setSessionState({
            status: "error",
            message:
              "The Facebook authorization session does not belong to this workspace.",
          });

          return;
        }

        const expiresAt = new Date(session.expiresAt).getTime();

        if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
          setSessionState({
            status: "error",
            message:
              "Your Facebook authorization session has expired. Please reconnect your Facebook account.",
          });

          return;
        }

        setSessionState({
          status: "success",
          session,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setSessionState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Unable to retrieve Facebook Pages.",
        });
      }
    }

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, retryCount]);

  function handleRetry() {
    setRetryCount((count) => count + 1);
  }

  if (sessionState.status === "loading") {
    return (
      <section
        aria-busy="true"
        className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <h2 className="text-lg font-semibold text-gray-900">
          Loading Facebook Pages
        </h2>

        <p className="mt-2 text-sm text-gray-600">
          Retrieving the Pages available from your Facebook authorization
          session...
        </p>

        <div
          role="status"
          className="mt-5 flex items-center gap-3 text-sm text-blue-700"
        >
          <span
            aria-hidden="true"
            className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600"
          />
          Loading...
        </div>
      </section>
    );
  }

  if (sessionState.status === "error") {
    return (
      <section className="rounded-xl border border-red-200 bg-red-50 p-6">
        <h2 className="text-lg font-semibold text-red-900">
          Unable to Load Facebook Pages
        </h2>

        <p role="alert" className="mt-2 text-sm text-red-800">
          {sessionState.message}
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleRetry}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800"
          >
            Try Again
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-100"
            >
              Close
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <FacebookPageSelector
      workspaceId={workspaceId}
      pages={sessionState.session.pages}
      expiresAt={sessionState.session.expiresAt}
      onConnected={onConnected}
      onCancel={onClose}
    />
  );
}
