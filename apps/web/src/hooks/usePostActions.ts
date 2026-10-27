import { useState } from "react";
import { deleteDraftPost, type Post } from "@/lib/posts";

type UsePostActionsOptions = {
  setSavedPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  setNotice: (value: string) => void;
};

export function usePostActions({
  setSavedPosts,
  setNotice,
}: UsePostActionsOptions) {
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [deletePostError, setDeletePostError] = useState("");

  async function handleDeleteDraft(postId: string, postTitle: string) {
    const confirmed = window.confirm(
      `Delete this draft?\n\n${postTitle}\n\nThis action cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingPostId(postId);
    setDeletePostError("");

    try {
      await deleteDraftPost(postId);

      setSavedPosts((current) => current.filter((post) => post._id !== postId));

      setNotice("Draft deleted successfully.");
    } catch (error) {
      setDeletePostError(
        error instanceof Error ? error.message : "Unable to delete the draft.",
      );
    } finally {
      setDeletingPostId(null);
    }
  }

  return {
    deletingPostId,
    deletePostError,
    handleDeleteDraft,
  };
}
