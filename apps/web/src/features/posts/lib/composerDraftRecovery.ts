import { apiFetch } from "@/lib/api";
import type { Post, PostPlatform } from "@/lib/posts";

export type ComposerSnapshot = {
  workspaceId: string;
  clientDraftId: string;
  revision: number;
  title: string;
  caption: string;
  platforms: PostPlatform[];
  mediaIds: string[];
  scheduledAt?: string;
};
const prefix = "storm:composer-draft:v1:";
const inFlight = new Map<string, Promise<void>>();
const finished = new Set<string>();
function storageKey(ownerId: string, id: string) { return `${prefix}${ownerId}:${id}`; }
export function storeComposerDraft(ownerId: string, snapshot: ComposerSnapshot): boolean {
  if (finished.has(snapshot.clientDraftId)) return true;
  try { localStorage.setItem(storageKey(ownerId, snapshot.clientDraftId), JSON.stringify(snapshot)); return true; }
  catch { return false; }
}
export function completeComposerDraft(ownerId: string, id: string) {
  finished.add(id);
  try { localStorage.removeItem(storageKey(ownerId, id)); } catch { /* Storage may be unavailable. */ }
}
function report(id: string, state: string) {
  window.dispatchEvent(new CustomEvent("storm:draft-save-status", { detail: { id, state } }));
}
export function syncComposerDraft(ownerId: string, id: string, keepalive = false): Promise<void> {
  const key = storageKey(ownerId, id);
  const pending = inFlight.get(key);
  if (pending) return pending;
  const run = async () => {
    let snapshot: ComposerSnapshot;
    try {
      const raw = localStorage.getItem(key);
      if (!raw || finished.has(id)) return;
      snapshot = JSON.parse(raw);
      if (snapshot.clientDraftId !== id) return;
    } catch { return; }
    report(id, "saving");
    try {
      await apiFetch<{ post: Post }>("/api/posts/autosave", {
        method: "PUT", body: JSON.stringify({ ...snapshot, title: snapshot.title.trim() || "Untitled" }), keepalive,
      });
      const latest = localStorage.getItem(key);
      if (latest && JSON.parse(latest).revision === snapshot.revision) localStorage.removeItem(key);
      report(id, "saved");
      window.dispatchEvent(new Event("storm:posts-changed"));
    } catch {
      // Retain the account-scoped outbox for reconnect/reopen recovery.
      report(id, "pending");
    }
  };
  const promise = run().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}
export async function syncComposerDrafts(ownerId: string, keepalive = false) {
  let keys: string[];
  try { keys = Object.keys(localStorage).filter((key) => key.startsWith(`${prefix}${ownerId}:`)); }
  catch { return; }
  await Promise.allSettled(keys.map((key) => syncComposerDraft(ownerId, key.slice(`${prefix}${ownerId}:`.length), keepalive)));
}
