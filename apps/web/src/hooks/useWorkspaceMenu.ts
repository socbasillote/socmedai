import { useState } from "react";

export function useWorkspaceMenu() {
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);

  function openWorkspaceMenu() {
    setWorkspaceMenuOpen(true);
  }

  function closeWorkspaceMenu() {
    setWorkspaceMenuOpen(false);
  }

  function toggleWorkspaceMenu() {
    setWorkspaceMenuOpen((current) => !current);
  }

  return {
    workspaceMenuOpen,
    setWorkspaceMenuOpen,
    openWorkspaceMenu,
    closeWorkspaceMenu,
    toggleWorkspaceMenu,
  };
}
