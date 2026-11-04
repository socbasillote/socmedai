import type { ComponentProps } from "react";

import { CreateWorkspaceForm } from "@/components/CreateWorkspaceForm";

import { PostDetailsModal } from "@/components/PostDetailsModal";

/**
 * Reuse the exact prop contracts of the
 * existing presentation components.
 */
type WorkspaceFormProps = ComponentProps<typeof CreateWorkspaceForm>;

type PostDetailsProps = ComponentProps<typeof PostDetailsModal>;

type DashboardOverlaysProps = {
  /**
   * Workspace creation form is displayed
   * only when explicitly opened.
   */
  createWorkspaceOpen: boolean;

  /**
   * Workspace creation state and handlers.
   */
  workspaceFormProps: WorkspaceFormProps;

  /**
   * A null post means no details modal.
   */
  selectedPost: PostDetailsProps["post"] | null;

  /**
   * Close the currently selected post.
   */
  onClosePostDetails: PostDetailsProps["onClose"];
};

/**
 * Dashboard overlay presentation.
 *
 * Responsibilities:
 * - Conditionally render workspace creation.
 * - Conditionally render post details.
 * - Forward existing data and event handlers.
 *
 * Does not:
 * - Create workspaces.
 * - Fetch or modify posts.
 * - Own modal state.
 * - Perform API requests.
 */
export function DashboardOverlays({
  createWorkspaceOpen,
  workspaceFormProps,
  selectedPost,
  onClosePostDetails,
}: DashboardOverlaysProps) {
  return (
    <>
      {createWorkspaceOpen && <CreateWorkspaceForm {...workspaceFormProps} />}

      {selectedPost && (
        <PostDetailsModal post={selectedPost} onClose={onClosePostDetails} />
      )}
    </>
  );
}
