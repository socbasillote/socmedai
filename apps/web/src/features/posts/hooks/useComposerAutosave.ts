import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { completeComposerDraft, storeComposerDraft, syncComposerDraft, type ComposerSnapshot } from "../lib/composerDraftRecovery";

type Options = {
  ownerId: string | null;
  enabled: boolean;
  content: Omit<ComposerSnapshot, "clientDraftId" | "revision">;
};
export function useComposerAutosave({ ownerId, enabled, content }: Options) {
  const scope = `${ownerId}:${content.workspaceId}`;
  const [identity, setIdentity] = useState(() => ({ scope, id: crypto.randomUUID() }));
  // React retries this render before committing effects for the new account/workspace.
  if (identity.scope !== scope) setIdentity({ scope, id: crypto.randomUUID() });
  const id = identity.id;
  const revision = useRef(0);
  const snapshots = useRef(new Map<string, ComposerSnapshot>());
  const [saveState, setSaveState] = useState<{ id: string; state: string } | null>(null);
  const serialized = JSON.stringify(content);
  useLayoutEffect(() => {
    if (!enabled || !ownerId || !content.workspaceId) return;
    const snapshot = JSON.parse(serialized) as Options["content"];
    // Defaults alone must not create a draft. Once editing has started, keep
    // saving subsequent changes, including clearing previously entered content.
    const hasContent = Boolean(snapshot.title.trim() || snapshot.caption.trim() || snapshot.mediaIds.length);
    if (!hasContent && !snapshots.current.has(id)) return;
    const current = { ...snapshot, clientDraftId: id, revision: ++revision.current };
    snapshots.current.set(id, current);
    const stored = storeComposerDraft(ownerId, current);
    const timer = setTimeout(() => {
      if (stored) void syncComposerDraft(ownerId, id);
      else setSaveState({ id, state: "unavailable" });
    }, 600);
    return () => clearTimeout(timer);
  }, [serialized, enabled, ownerId, id, content.workspaceId]);
  useEffect(() => {
    function status(event: Event) {
      const detail = (event as CustomEvent<{ id: string; state: string }>).detail;
      if (detail.id === id) setSaveState(detail);
    }
    window.addEventListener("storm:draft-save-status", status);
    const pendingSnapshots = snapshots.current;
    const flush = () => {
      const snapshot = pendingSnapshots.get(id);
      if (enabled && ownerId && snapshot) {
        storeComposerDraft(ownerId, snapshot);
        void syncComposerDraft(ownerId, id, true);
      }
    };
    const hidden = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("storm:draft-save-status", status);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", hidden);
      flush();
    };
  }, [enabled, ownerId, id]);
  return {
    clientDraftId: id,
    status: saveState?.id === id ? saveState.state : "idle",
    complete: () => { if (ownerId) completeComposerDraft(ownerId, id); },
  };
}
