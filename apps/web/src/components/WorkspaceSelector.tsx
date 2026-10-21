import { ChevronDown, Plus } from "lucide-react";
import type { Workspace } from "@/lib/workspaces";

type WorkspaceSelectorProps = {
  workspaces: Workspace[];
  selectedWorkspace: Workspace | null;
  selectedWorkspaceId: string;
  workspacesLoading: boolean;
  workspaceError: string;
  workspaceMenuOpen: boolean;
  setWorkspaceMenuOpen: (
    open: boolean | ((current: boolean) => boolean),
  ) => void;
  setSelectedWorkspaceId: (id: string) => void;
  storeWorkspaceId: (id: string) => void;
  onCreateWorkspace: () => void;
};

export function WorkspaceSelector({
  workspaces,
  selectedWorkspace,
  selectedWorkspaceId,
  workspacesLoading,
  workspaceError,
  workspaceMenuOpen,
  setWorkspaceMenuOpen,
  setSelectedWorkspaceId,
  storeWorkspaceId,
  onCreateWorkspace,
}: WorkspaceSelectorProps) {
  return (
    <div className="border-b border-white/10 p-4">
      <div className="relative">
        <button
          type="button"
          aria-expanded={workspaceMenuOpen}
          aria-haspopup="listbox"
          disabled={workspacesLoading || workspaces.length === 0}
          onClick={() => setWorkspaceMenuOpen((open) => !open)}
          className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-200 font-bold text-amber-900">
            {(selectedWorkspace?.name ?? "W").charAt(0).toUpperCase()}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">
              {workspacesLoading
                ? "Loading workspaces..."
                : (selectedWorkspace?.name ?? "No workspace yet")}
            </p>
            <p className="mt-0.5 truncate text-xs text-slate-400">
              {workspaceError
                ? "Unable to load workspaces"
                : `${workspaces.length} workspace${workspaces.length === 1 ? "" : "s"}`}
            </p>
          </div>

          <ChevronDown size={16} className="shrink-0" />
        </button>

        {workspaceMenuOpen && (
          <div
            role="listbox"
            aria-label="Select workspace"
            className="absolute left-0 right-0 top-full z-50 mt-2 rounded-xl border border-white/10 bg-slate-900 p-2 shadow-xl"
          >
            {workspaces.map((workspace) => (
              <button
                key={workspace._id}
                type="button"
                role="option"
                aria-selected={workspace._id === selectedWorkspaceId}
                onClick={() => {
                  setSelectedWorkspaceId(workspace._id);
                  storeWorkspaceId(workspace._id);
                  setWorkspaceMenuOpen(false);
                }}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                  workspace._id === selectedWorkspaceId
                    ? "bg-violet-500/20 text-violet-200"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className="block truncate font-medium">
                  {workspace.name}
                </span>
                <span className="mt-1 block text-xs text-slate-400">
                  {workspace._id === selectedWorkspaceId
                    ? "Currently selected"
                    : "Switch workspace"}
                </span>
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={onCreateWorkspace}
          className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-violet-300 transition hover:bg-white/5 hover:text-white"
        >
          <Plus size={16} />
          Create workspace
        </button>
      </div>

      {workspaceError && (
        <p role="alert" className="mt-2 px-1 text-xs text-rose-300">
          {workspaceError}
        </p>
      )}
    </div>
  );
}
