import { Check, ChevronDown, Plus, Search, Settings } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useAuth } from "@/auth/useAuth";
import { useSidebarDropdown } from "@/hooks/useSidebarDropdown";
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
  onWorkspaceSettings?: () => void;
};
function readRecent(key: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string").slice(0, 30)
      : [];
  } catch {
    return [];
  }
}
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
  onWorkspaceSettings,
}: WorkspaceSelectorProps) {
  const { user } = useAuth();
  const recentKey = `storm:recent-workspaces:${user?.id ?? "anonymous"}`;
  const [history, setHistory] = useState(() => ({
    key: recentKey,
    selected: selectedWorkspaceId,
    ids: [
      selectedWorkspaceId,
      ...readRecent(recentKey).filter((item) => item !== selectedWorkspaceId),
    ].filter(Boolean),
  }));
  const recent =
    history.key === recentKey ? history.ids : readRecent(recentKey);
  if (history.key !== recentKey || history.selected !== selectedWorkspaceId) {
    setHistory({
      key: recentKey,
      selected: selectedWorkspaceId,
      ids: [
        selectedWorkspaceId,
        ...recent.filter((item) => item !== selectedWorkspaceId),
      ]
        .filter(Boolean)
        .slice(0, 30),
    });
  }
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const id = useId();
  const {
    root: rootRef,
    trigger: triggerRef,
    close: closeMenu,
    onKeyDown,
    onTriggerFocus,
  } = useSidebarDropdown(workspaceMenuOpen, setWorkspaceMenuOpen);
  useEffect(() => {
    if (!selectedWorkspaceId) return;
    const next = [
      selectedWorkspaceId,
      ...history.ids.filter((item) => item !== selectedWorkspaceId),
    ].slice(0, 30);
    try {
      localStorage.setItem(recentKey, JSON.stringify(next));
    } catch {
      /* Selection works without storage. */
    }
  }, [recentKey, selectedWorkspaceId, history.ids]);
  const [wasOpen, setWasOpen] = useState(workspaceMenuOpen);
  if (wasOpen !== workspaceMenuOpen) {
    setWasOpen(workspaceMenuOpen);
    if (!workspaceMenuOpen) {
      setQuery("");
      setShowAll(false);
    }
  }
  const ordered = [...workspaces].sort((a, b) => {
    const rank = (workspace: Workspace) => {
      const index = recent.indexOf(workspace._id);
      return index < 0 ? Number.MAX_SAFE_INTEGER : index;
    };
    return rank(a) - rank(b);
  });
  const others = ordered.filter(
    (workspace) => workspace._id !== selectedWorkspaceId,
  );
  const matches = query.trim()
    ? ordered.filter((workspace) =>
        workspace.name
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase()),
      )
    : showAll
      ? others
      : others.slice(0, 3);
  function choose(workspace: Workspace) {
    setSelectedWorkspaceId(workspace._id);
    storeWorkspaceId(workspace._id);
    closeMenu(true);
  }
  const row = (workspace: Workspace) => (
    <button
      key={workspace._id}
      type="button"
      data-dropdown-item
      aria-current={workspace._id === selectedWorkspaceId ? "true" : undefined}
      onClick={() => choose(workspace)}
      className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-slate-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-violet-400"
    >
      <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
      {workspace._id === selectedWorkspaceId && (
        <Check
          size={18}
          aria-label="Current workspace"
          className="shrink-0 text-violet-300"
        />
      )}
    </button>
  );
  return (
    <div className="shrink-0 border-b border-white/10 p-3">
      <div ref={rootRef} onKeyDown={onKeyDown} className="relative">
        <div className="flex items-center rounded-xl border border-white/10 bg-white/5">
          <button
            ref={triggerRef}
            type="button"
            aria-label="Switch workspace"
            aria-expanded={workspaceMenuOpen}
            aria-controls={id}
            aria-haspopup="dialog"
            disabled={workspacesLoading}
            onFocus={onTriggerFocus}
            onClick={() => setWorkspaceMenuOpen(true)}
            className="flex min-h-16 min-w-0 flex-1 items-center gap-2 rounded-l-xl p-2 text-left hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-violet-400 disabled:opacity-60"
          >
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-200 font-bold text-amber-900"
            >
              {(selectedWorkspace?.name ?? "W").charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-white">
                {workspacesLoading
                  ? "Loading workspaces?"
                  : (selectedWorkspace?.name ?? "No workspace yet")}
              </span>
              <span className="block text-xs text-slate-400">
                {workspaces.length} workspace
                {workspaces.length === 1 ? "" : "s"}
              </span>
            </span>
            <ChevronDown size={14} aria-hidden="true" className="shrink-0" />
          </button>
          <button
            type="button"
            aria-label="Workspace settings"
            title="Workspace settings"
            disabled={!selectedWorkspace}
            onClick={() => {
              closeMenu();
              onWorkspaceSettings?.();
            }}
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-violet-400 disabled:opacity-40"
          >
            <Settings size={18} />
          </button>
        </div>
        {workspaceMenuOpen && (
          <div
            id={id}
            role="dialog"
            aria-label="Workspace switcher"
            className="absolute left-0 top-full z-50 mt-2 w-full min-w-56 rounded-xl border border-white/10 bg-slate-900 p-2 shadow-2xl"
          >
            <label className="mb-2 flex min-h-11 items-center gap-2 rounded-lg border border-white/15 px-2">
              <Search
                size={16}
                aria-hidden="true"
                className="shrink-0 text-slate-400"
              />
              <input
                data-dropdown-item
                aria-label="Find a workspace"
                placeholder="Find a workspace"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-h-11 w-full min-w-0 bg-transparent text-sm text-white outline-none placeholder:text-slate-400"
              />
            </label>
            <div className="max-h-[max(5rem,calc(100dvh-24rem))] overflow-y-auto">
              <p className="px-2 pb-1 pt-3 text-xs font-semibold text-slate-400">
                Current workspace
              </p>
              {!query.trim() && selectedWorkspace && row(selectedWorkspace)}
              <p className="px-2 pb-1 pt-3 text-xs font-semibold text-slate-400">
                {query.trim()
                  ? "Search results"
                  : showAll
                    ? "All workspaces"
                    : "Switch to"}
              </p>
              {matches.map(row)}
              {matches.length === 0 && (
                <p role="status" className="px-2 py-2 text-sm text-slate-400">
                  {query.trim()
                    ? "No workspaces found."
                    : "No other workspaces yet."}
                </p>
              )}
            </div>
            {!showAll && !query.trim() && (
              <button
                type="button"
                data-dropdown-item
                onClick={() => setShowAll(true)}
                className="min-h-11 w-full rounded-lg px-2 text-left text-sm text-violet-300 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-violet-400"
              >
                View all {workspaces.length} workspaces
              </button>
            )}
            <div className="mt-2 border-t border-white/10 pt-2">
              <button
                type="button"
                data-dropdown-item
                onClick={() => {
                  closeMenu();
                  onCreateWorkspace();
                }}
                className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-sm text-violet-300 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-violet-400"
              >
                <Plus size={16} aria-hidden="true" />
                Create workspace
              </button>
            </div>
          </div>
        )}
      </div>
      {workspaceError && (
        <p role="alert" className="mt-2 px-1 text-xs text-rose-300">
          {workspaceError}
        </p>
      )}
    </div>
  );
}
