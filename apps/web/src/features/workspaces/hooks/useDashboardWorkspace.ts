import { useMemo } from "react";

import { useWorkspaces } from "@/hooks/useWorkspaces";
import { useWorkspaceActions } from "@/hooks/useWorkspaceActions";
import { useCreateWorkspaceForm } from "@/hooks/useCreateWorkspaceForm";
import { useWorkspaceMenu } from "@/hooks/useWorkspaceMenu";

/**
 * Reuse the notice callback contract already
 * defined by the existing workspace actions hook.
 */
type NoticeHandler = Parameters<typeof useWorkspaceActions>[0]["setNotice"];

/**
 * Dashboard workspace orchestration.
 *
 * Responsibilities:
 * - Workspace loading and selection
 * - Workspace creation
 * - Create-workspace form state
 * - Workspace selector menu state
 * - Deriving the selected workspace
 *
 * Does not:
 * - Render any UI
 * - Manage Facebook or LinkedIn connections
 * - Handle OAuth callbacks
 * - Manage posts or publishing
 */
export function useDashboardWorkspace(setNotice: NoticeHandler) {
  // Existing workspace data and selection logic.
  const {
    workspaces,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    workspacesLoading,
    workspaceError,
    addWorkspace,
  } = useWorkspaces();

  // Existing workspace selector menu.
  const { workspaceMenuOpen, setWorkspaceMenuOpen } = useWorkspaceMenu();

  // Existing workspace creation form.
  const {
    createWorkspaceOpen,
    setCreateWorkspaceOpen,
    newWorkspaceName,
    setNewWorkspaceName,
    openCreateWorkspace,
    closeCreateWorkspace,
  } = useCreateWorkspaceForm();

  // Existing workspace creation action.
  const {
    creatingWorkspace,
    createWorkspaceError,
    setCreateWorkspaceError,
    handleCreateWorkspace,
  } = useWorkspaceActions({
    addWorkspace,
    setSelectedWorkspaceId,
    setNewWorkspaceName,
    setCreateWorkspaceOpen,
    setNotice,
  });

  // Derived workspace selection.
  const selectedWorkspace = useMemo(
    () =>
      workspaces.find((workspace) => workspace._id === selectedWorkspaceId) ??
      null,
    [workspaces, selectedWorkspaceId],
  );

  return {
    // Workspace data and selection.
    workspaces,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    workspacesLoading,
    workspaceError,
    selectedWorkspace,

    // Workspace selector menu.
    workspaceMenuOpen,
    setWorkspaceMenuOpen,

    // Workspace creation form.
    createWorkspaceOpen,
    setCreateWorkspaceOpen,
    newWorkspaceName,
    setNewWorkspaceName,
    openCreateWorkspace,
    closeCreateWorkspace,

    // Workspace creation action.
    creatingWorkspace,
    createWorkspaceError,
    setCreateWorkspaceError,
    handleCreateWorkspace,
  };
}
