import { useState } from "react";
import { createWorkspace, type Workspace } from "@/lib/workspaces";
import { storeWorkspaceId } from "@/lib/workspaceSelection";

type UseWorkspaceActionsOptions = {
  addWorkspace: (workspace: Workspace) => void;
  setSelectedWorkspaceId: (workspaceId: string) => void;
  setNewWorkspaceName: (name: string) => void;
  setCreateWorkspaceOpen: (open: boolean) => void;
  setNotice: (message: string) => void;
};

export function useWorkspaceActions({
  addWorkspace,
  setSelectedWorkspaceId,
  setNewWorkspaceName,
  setCreateWorkspaceOpen,
  setNotice,
}: UseWorkspaceActionsOptions) {
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [createWorkspaceError, setCreateWorkspaceError] = useState("");

  async function handleCreateWorkspace(newWorkspaceName: string) {
    const name = newWorkspaceName.trim();

    if (!name) {
      setCreateWorkspaceError("Workspace name is required.");
      return;
    }

    if (name.length > 100) {
      setCreateWorkspaceError(
        "Workspace name must be 100 characters or fewer.",
      );
      return;
    }

    setCreatingWorkspace(true);
    setCreateWorkspaceError("");

    try {
      const workspace = await createWorkspace(name);

      addWorkspace(workspace);
      setSelectedWorkspaceId(workspace._id);
      storeWorkspaceId(workspace._id);
      setNewWorkspaceName("");
      setCreateWorkspaceOpen(false);
      setNotice(`Workspace "${workspace.name}" created successfully.`);
    } catch (error) {
      setCreateWorkspaceError(
        error instanceof Error ? error.message : "Unable to create workspace.",
      );
    } finally {
      setCreatingWorkspace(false);
    }
  }

  return {
    creatingWorkspace,
    createWorkspaceError,
    setCreateWorkspaceError,
    handleCreateWorkspace,
  };
}
