import { useState } from "react";
import { createPost, deleteDraftPost, type Post } from "@/lib/posts";

type Platform = "facebook" | "instagram" | "linkedin";
type PostMode = "draft" | "scheduled";

type UsePostActionsOptions = {
  selectedWorkspaceId: string;
  setSavedPosts: React.Dispatch<React.SetStateAction<Post[]>>;

  caption: string;
  setCaption: (value: string) => void;
  selectedPlatforms: Platform[];
  setSelectedPlatforms: (value: Platform[]) => void;
  postMode: PostMode;
  setPostMode: (value: PostMode) => void;
  scheduledAt: string;
  setScheduledAt: (value: string) => void;
  setCreateOpen: (value: boolean) => void;

  setNotice: (value: string) => void;
};

export function usePostActions({
  selectedWorkspaceId,
  setSavedPosts,
  caption,
  setCaption,
  selectedPlatforms,
  setSelectedPlatforms,
  postMode,
  setPostMode,
  scheduledAt,
  setScheduledAt,
  setCreateOpen,
  setNotice,
}: UsePostActionsOptions) {
  const [savingPost, setSavingPost] = useState(false);
  const [postError, setPostError] = useState("");
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [deletePostError, setDeletePostError] = useState("");

  async function saveDraft() {
    const text = caption.trim();

    if (!selectedWorkspaceId) {
      setPostError("Select a workspace before saving a post.");
      return;
    }

    if (!text) {
      setPostError("Enter a caption before saving your post.");
      return;
    }

    if (selectedPlatforms.length === 0) {
      setPostError("Select at least one publishing platform.");
      return;
    }

    let scheduledTime: string | undefined;

    if (postMode === "scheduled") {
      if (!scheduledAt) {
        setPostError("Choose a date and time for your scheduled post.");
        return;
      }

      const parsedTime = new Date(scheduledAt);

      if (
        Number.isNaN(parsedTime.getTime()) ||
        parsedTime.getTime() <= Date.now()
      ) {
        setPostError("Scheduled time must be in the future.");
        return;
      }

      scheduledTime = parsedTime.toISOString();
    }

    setSavingPost(true);
    setPostError("");

    try {
      const post = await createPost({
        workspaceId: selectedWorkspaceId,
        caption: text,
        platforms: selectedPlatforms,
        ...(scheduledTime ? { scheduledAt: scheduledTime } : {}),
      });

      setSavedPosts((current) => [post, ...current]);

      setCaption("");
      setSelectedPlatforms(["facebook"]);
      setScheduledAt("");
      setPostMode("draft");
      setCreateOpen(false);

      setNotice(
        postMode === "scheduled"
          ? "Post scheduled in your workspace."
          : "Draft saved to your workspace.",
      );
    } catch (error) {
      setPostError(
        error instanceof Error ? error.message : "Unable to save the post.",
      );
    } finally {
      setSavingPost(false);
    }
  }

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
    savingPost,
    postError,
    setPostError,
    deletingPostId,
    deletePostError,
    saveDraft,
    handleDeleteDraft,
  };
}
