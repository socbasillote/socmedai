import { Button } from "@/components/ui/button";

type LinkedInStatus =
  | "idle"
  | "loading"
  | "connected"
  | "disconnected"
  | "expired"
  | "revoked"
  | "error";

type LinkedInConnectionPanelProps = {
  status: LinkedInStatus;
  displayName: string | null;
  connectionId: string | null;
  statusError: string | null;
  connectError: string | null;
  disconnectError: string | null;
  connecting: boolean;
  disconnecting: boolean;
  workspaceId: string;
  workspacesLoading: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
};

export function LinkedInConnectionPanel({
  status,
  displayName,
  connectionId,
  statusError,
  connectError,
  disconnectError,
  connecting,
  disconnecting,
  workspaceId,
  workspacesLoading,
  onConnect,
  onDisconnect,
}: LinkedInConnectionPanelProps) {
  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={!workspaceId || workspacesLoading || connecting}
        onClick={onConnect}
        className="shrink-0"
      >
        {connecting ? "Connecting..." : "Connect LinkedIn"}
      </Button>

      {connectionId && status === "connected" && (
        <Button
          type="button"
          variant="outline"
          disabled={disconnecting || connecting}
          onClick={onDisconnect}
          className="shrink-0"
        >
          {disconnecting ? "Disconnecting..." : "Disconnect"}
        </Button>
      )}

      <div className="flex flex-col gap-1 text-sm">
        {status === "loading" && (
          <span className="text-slate-500">Checking LinkedIn...</span>
        )}

        {status === "connected" && (
          <span className="text-emerald-600">
            Connected{displayName ? ` · ${displayName}` : ""}
          </span>
        )}

        {status === "disconnected" && (
          <span className="text-slate-500">LinkedIn not connected</span>
        )}

        {status === "expired" && (
          <span className="text-amber-600">
            LinkedIn session expired. Reconnect required.
          </span>
        )}

        {status === "revoked" && (
          <span className="text-amber-600">
            LinkedIn access revoked. Reconnect required.
          </span>
        )}

        {status === "error" && (
          <span role="alert" className="text-rose-600">
            {statusError || "Unable to load LinkedIn status."}
          </span>
        )}

        {disconnectError && (
          <p role="alert" className="max-w-xs text-sm text-rose-600">
            {disconnectError}
          </p>
        )}
      </div>

      {connectError && (
        <p role="alert" className="max-w-xs text-sm text-rose-600">
          {connectError}
        </p>
      )}
    </>
  );
}
