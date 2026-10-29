import { useCallback, useEffect, useState } from "react";

import {
  getFacebookConnections,
  type FacebookConnectionInfo,
} from "@/lib/facebookApi";

type FacebookConnectionsState = {
  workspaceId: string;
  connections: FacebookConnectionInfo[];
  loading: boolean;
  error: string;
};

/**
 * Load and manage Facebook Page connections
 * for the currently selected Storm workspace.
 */
export function useFacebookConnections(selectedWorkspaceId: string) {
  const [state, setState] = useState<FacebookConnectionsState>({
    workspaceId: "",
    connections: [],
    loading: false,
    error: "",
  });

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    const workspaceId = selectedWorkspaceId.trim();

    // No workspace selected.
    if (!workspaceId) {
      setState({
        workspaceId: "",
        connections: [],
        loading: false,
        error: "",
      });

      return () => {
        active = false;
      };
    }

    // Begin loading the selected workspace.
    setState({
      workspaceId,
      connections: [],
      loading: true,
      error: "",
    });

    async function loadConnections() {
      try {
        const response = await getFacebookConnections(workspaceId);

        // Ignore results from an old workspace
        // or a component that has unmounted.
        if (!active) {
          return;
        }

        setState({
          workspaceId,
          connections: response.connections,
          loading: false,
          error: "",
        });
      } catch (error) {
        if (!active) {
          return;
        }

        setState({
          workspaceId,
          connections: [],
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "Unable to load Facebook connections.",
        });
      }
    }

    void loadConnections();

    return () => {
      active = false;
    };
  }, [selectedWorkspaceId, refreshKey]);

  /**
   * Reload connections after a successful
   * Facebook OAuth Page connection.
   */
  const refreshConnections = useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []);

  /**
   * Prevent connections from a previously selected
   * workspace from appearing during a transition.
   */
  const matchesSelectedWorkspace =
    state.workspaceId === selectedWorkspaceId.trim();

  return {
    connections: matchesSelectedWorkspace ? state.connections : [],

    loading: selectedWorkspaceId.trim()
      ? !matchesSelectedWorkspace || state.loading
      : false,

    error: matchesSelectedWorkspace ? state.error : "",

    refreshConnections,
  };
}
