import { useCallback, useEffect, useState } from "react";
import {
  disconnectLinkedInConnection,
  getLinkedInStatus,
  startLinkedInConnect,
} from "@/lib/linkedin";

type LinkedInStatus =
  | "idle"
  | "loading"
  | "connected"
  | "disconnected"
  | "expired"
  | "revoked"
  | "error";

export function useLinkedInConnection(
  selectedWorkspaceId: string,
  onNotice: (message: string) => void,
) {
  const [status, setStatus] = useState<LinkedInStatus>("idle");
  const [displayName, setDisplayName] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [statusError, setStatusError] = useState("");
  const [connectError, setConnectError] = useState("");
  const [disconnectError, setDisconnectError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadStatus() {
      if (!selectedWorkspaceId) {
        setStatus("idle");
        setDisplayName("");
        setConnectionId("");
        setStatusError("");
        return;
      }

      setStatus("loading");
      setDisplayName("");
      setConnectionId("");
      setStatusError("");

      try {
        const result = await getLinkedInStatus(selectedWorkspaceId);

        if (!active) return;

        if (!result.connection) {
          setStatus("disconnected");
          return;
        }

        setConnectionId(result.connection.id);
        setStatus(result.connection.status);
        setDisplayName(result.connection.displayName ?? "");
      } catch (error) {
        if (!active) return;

        setStatus("error");
        setConnectionId("");
        setStatusError(
          error instanceof Error
            ? error.message
            : "Unable to load LinkedIn connection status.",
        );
      }
    }

    void loadStatus();

    return () => {
      active = false;
    };
  }, [selectedWorkspaceId, refreshKey]);

  async function connect() {
    if (!selectedWorkspaceId || connecting || disconnecting) return;

    setConnecting(true);
    setConnectError("");
    setDisconnectError("");

    try {
      const authorizationUrl = await startLinkedInConnect(selectedWorkspaceId);

      window.location.assign(authorizationUrl);
    } catch (error) {
      setConnectError(
        error instanceof Error
          ? error.message
          : "Unable to start LinkedIn connection.",
      );
      setConnecting(false);
    }
  }

  async function disconnect() {
    if (!selectedWorkspaceId || !connectionId || connecting || disconnecting) {
      return;
    }

    const confirmed = window.confirm(
      "Disconnect this LinkedIn account from Storm? This removes the saved connection from Storm but does not revoke access at LinkedIn.",
    );

    if (!confirmed) return;

    setDisconnecting(true);
    setDisconnectError("");
    setConnectError("");

    try {
      await disconnectLinkedInConnection(connectionId, selectedWorkspaceId);

      onNotice("LinkedIn connection removed from Storm.");
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setDisconnectError(
        error instanceof Error
          ? error.message
          : "Unable to disconnect LinkedIn.",
      );
    } finally {
      setDisconnecting(false);
    }
  }

  const refreshStatus = useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []);

  return {
    status,
    displayName,
    connectionId,
    statusError,
    connectError,
    disconnectError,
    connecting,
    disconnecting,
    connect,
    disconnect,
    refreshStatus,
    setConnectError,
  };
}
