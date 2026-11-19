import { useEffect } from "react";
import { syncComposerDrafts } from "../lib/composerDraftRecovery";

export function ComposerDraftSync({ ownerId }: { ownerId: string | null }) {
  useEffect(() => {
    if (!ownerId) return;
    const sync = () => { void syncComposerDrafts(ownerId); };
    const closing = () => { void syncComposerDrafts(ownerId, true); };
    sync();
    const timer = window.setInterval(sync, 15000);
    window.addEventListener("online", sync);
    window.addEventListener("pagehide", closing);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", sync);
      window.removeEventListener("pagehide", closing);
    };
  }, [ownerId]);
  return null;
}
