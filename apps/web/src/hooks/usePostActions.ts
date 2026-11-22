import { useState } from "react";
import { deleteDraftPost, type Post } from "@/lib/posts";

type UsePostActionsOptions = {
  setSavedPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  setNotice: (value: string) => void;
  onDeleted: () => void;
};

export function usePostActions({
  setSavedPosts,
  setNotice,
  onDeleted,
}: UsePostActionsOptions) {
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [deletePostError, setDeletePostError] = useState("");

  async function handleDeleteDraft(postId: string) {
    setDeletingPostId(postId);
    setDeletePostError("");

    try {
      await deleteDraftPost(postId);

      setSavedPosts((current) => current.filter((post) => post._id !== postId));

      onDeleted();
      setNotice("Draft deleted successfully.");
      return true;
    } catch (error) {
      setDeletePostError(
        error instanceof Error ? error.message : "Unable to delete the draft.",
      );
      return false;
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
