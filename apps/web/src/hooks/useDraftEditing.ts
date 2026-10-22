import { useState } from "react";
import { updateDraftPost, type Post } from "@/lib/posts";

type Platform = "facebook" | "instagram" | "linkedin";

type UseDraftEditingOptions = {
  setSavedPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  setNotice: (value: string) => void;
};

export function useDraftEditing({
  setSavedPosts,
  setNotice,
}: UseDraftEditingOptions) {
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCaption, setEditCaption] = useState("");
  const [editPlatforms, setEditPlatforms] = useState<Platform[]>(["facebook"]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editPostError, setEditPostError] = useState("");

  const handleEditDraft = (post: Post) => {
    if (post.status !== "draft") {
      return;
    }

    setEditingPostId(post._id);
    setEditTitle(post.title ?? "");
    setEditCaption(post.caption);
    setEditPlatforms(post.platforms);
    setEditPostError("");
    setNotice("");
  };

  const handleSaveDraftEdit = async () => {
    if (!editingPostId) {
      return;
    }

    const trimmedCaption = editCaption.trim();

    if (!trimmedCaption) {
      setEditPostError("Caption is required.");
      return;
    }

    if (editPlatforms.length === 0) {
      setEditPostError("Select at least one publishing platform.");
      return;
    }

    setSavingEdit(true);
    setEditPostError("");

    try {
      const updatedPost = await updateDraftPost(editingPostId, {
        title: editTitle.trim(),
        caption: trimmedCaption,
        platforms: editPlatforms,
      });

      setSavedPosts((currentPosts) =>
        currentPosts.map((post) =>
          post._id === updatedPost._id ? updatedPost : post,
        ),
      );

      setEditingPostId(null);
      setEditPostError("");
      setNotice("Draft updated successfully.");
    } catch (error) {
      setEditPostError(
        error instanceof Error ? error.message : "Failed to update draft.",
      );
    } finally {
      setSavingEdit(false);
    }
  };

  const cancelEdit = () => {
    setEditingPostId(null);
    setEditPostError("");
  };

  return {
    editingPostId,
    setEditingPostId,
    editTitle,
    setEditTitle,
    editCaption,
    setEditCaption,
    editPlatforms,
    setEditPlatforms,
    savingEdit,
    editPostError,
    setEditPostError,
    handleEditDraft,
    handleSaveDraftEdit,
    cancelEdit,
  };
}
