import { useFacebookConnection } from "@/hooks/useFacebookConnection";
import { useFacebookConnections } from "@/hooks/useFacebookConnections";

/**
 * Dashboard-level Facebook connection orchestration.
 *
 * Responsibilities:
 * - Initiate Facebook OAuth for the selected workspace.
 * - Retrieve Facebook Page connections for that workspace.
 * - Expose connection loading and error states.
 * - Refresh Page connections after OAuth completion.
 *
 * Does not:
 * - Handle OAuth callback URL parameters.
 * - Render Facebook connection UI.
 * - Publish posts.
 * - Store or modify access tokens.
 */
export function useDashboardFacebookConnection(selectedWorkspaceId: string) {
  const connection = useFacebookConnection(selectedWorkspaceId);

  const pageConnections = useFacebookConnections(selectedWorkspaceId);

  return {
    // Facebook OAuth initiation
    connecting: connection.connecting,
    connectError: connection.connectError,
    connect: connection.connect,

    // Workspace Facebook Page connections
    connections: pageConnections.connections,
    connectionsLoading: pageConnections.loading,
    connectionsError: pageConnections.error,
    refreshConnections: pageConnections.refreshConnections,
  };
}
