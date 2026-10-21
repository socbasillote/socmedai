import { useEffect, useState } from "react";
import { getWorkspaces, type Workspace } from "@/lib/workspaces";
import {
  clearStoredWorkspaceId,
  readStoredWorkspaceId,
  storeWorkspaceId,
} from "@/lib/workspaceSelection";

export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [workspacesLoading, setWorkspacesLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadWorkspaces() {
      setWorkspacesLoading(true);
      setWorkspaceError("");

      try {
        const result = await getWorkspaces();

        if (!active) return;

        setWorkspaces(result);

        const storedId = readStoredWorkspaceId();

        const validStoredWorkspace = storedId
          ? result.find((workspace) => workspace._id === storedId)
          : undefined;

        const nextWorkspaceId =
          validStoredWorkspace?._id ?? result[0]?._id ?? "";

        setSelectedWorkspaceId(nextWorkspaceId);

        if (nextWorkspaceId) {
          storeWorkspaceId(nextWorkspaceId);
        } else {
          clearStoredWorkspaceId();
        }
      } catch (error) {
        if (!active) return;

        setWorkspaceError(
          error instanceof Error
            ? error.message
            : "Unable to load your workspaces.",
        );
      } finally {
        if (active) {
          setWorkspacesLoading(false);
        }
      }
    }

    void loadWorkspaces();

    return () => {
      active = false;
    };
  }, []);

  function addWorkspace(workspace: Workspace) {
    setWorkspaces((current) => [workspace, ...current]);
  }

  return {
    workspaces,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    workspacesLoading,
    workspaceError,
    addWorkspace,
  };
}
