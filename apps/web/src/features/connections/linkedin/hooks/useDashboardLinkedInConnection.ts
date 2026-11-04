import { useLinkedInConnection } from "@/hooks/useLinkedInConnection";
import { useLinkedInCallback } from "@/hooks/useLinkedInCallback";

/**
 * Preserve the exact notice callback type expected by
 * the existing LinkedIn connection hook.
 *
 * This avoids duplicating shared hook contracts.
 */
type NoticeHandler = Parameters<typeof useLinkedInConnection>[1];

/**
 * Dashboard-level LinkedIn orchestration.
 *
 * Responsibilities:
 * - Retrieve connection state for the workspace
 * - Expose connect/disconnect actions
 * - Integrate LinkedIn OAuth callback handling
 *
 * Does not:
 * - Render UI
 * - Make direct API requests
 * - Manage Facebook connections
 * - Publish posts
 */
export function useDashboardLinkedInConnection(
  selectedWorkspaceId: string,
  setNotice: NoticeHandler,
) {
  const connection = useLinkedInConnection(selectedWorkspaceId, setNotice);

  useLinkedInCallback({
    refreshStatus: connection.refreshStatus,
    setConnectError: connection.setConnectError,
    setNotice,
  });

  return {
    status: connection.status,
    displayName: connection.displayName,
    connectionId: connection.connectionId,

    statusError: connection.statusError,
    connectError: connection.connectError,
    disconnectError: connection.disconnectError,

    connecting: connection.connecting,
    disconnecting: connection.disconnecting,

    connect: connection.connect,
    disconnect: connection.disconnect,

    refreshStatus: connection.refreshStatus,
    setConnectError: connection.setConnectError,
  };
}
