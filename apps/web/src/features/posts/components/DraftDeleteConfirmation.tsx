import { useRef, useState, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import type { useDashboardPosts } from "@/features/posts/hooks/useDashboardPosts";

export function DraftDeleteConfirmation({ posts, children }: {
  posts: ReturnType<typeof useDashboardPosts>;
  children: (requestDelete: (id: string, title: string) => void) => ReactNode;
}) {
  const [draftToDelete, setDraftToDelete] = useState<{ id: string; title: string } | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const deleting = useRef(false);
  async function confirmDelete() {
    if (!draftToDelete || deleting.current) return;
    deleting.current = true;
    setDeleteError("");
    try {
      if (await posts.handleDeleteDraft(draftToDelete.id)) setDraftToDelete(null);
      else setDeleteError("Unable to delete the draft. Please try again.");
    } finally {
      deleting.current = false;
    }
  }
  return <>
    {children((id, title) => {
      setDeleteError("");
      setDraftToDelete({ id, title });
    })}
      <Dialog.Root open={draftToDelete !== null} onOpenChange={(open) => {
        if (!open && !deleting.current) setDraftToDelete(null);
      }}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-slate-950/60" />
          <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl">
            <Dialog.Title className="text-lg font-semibold text-slate-900">Delete draft?</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-slate-600">
              Delete “{draftToDelete?.title || "Untitled"}”? This action cannot be undone.
            </Dialog.Description>
            {deleteError && <p role="alert" className="mt-3 text-sm text-red-600">{posts.deletePostError || deleteError}</p>}
            <div className="mt-6 flex justify-end gap-3">
              <Dialog.Close disabled={!!posts.deletingPostId} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">Cancel</Dialog.Close>
              <button type="button" disabled={!!posts.deletingPostId} onClick={() => void confirmDelete()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                {posts.deletingPostId ? "Deleting…" : "Delete draft"}
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
  </>;
}
