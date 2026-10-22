import { useState } from "react";

export function useCreateWorkspaceForm() {
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");

  function openCreateWorkspace() {
    setNewWorkspaceName("");
    setCreateWorkspaceOpen(true);
  }

  function closeCreateWorkspace() {
    setCreateWorkspaceOpen(false);
  }

  return {
    createWorkspaceOpen,
    setCreateWorkspaceOpen,
    newWorkspaceName,
    setNewWorkspaceName,
    openCreateWorkspace,
    closeCreateWorkspace,
  };
}
