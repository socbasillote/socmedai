export type PostEditorSession = {
  mode: "create" | "edit";
  workspaceId: string;
  postId: string | null;
};

export type PostEditorSessionResult = {
  valid: boolean;
  reason: "valid" | "workspace-changed" | "post-changed" | "mode-changed";
};

export function createPostEditorSession(
  mode: "create" | "edit",
  workspaceId: string,
  postId: string | null,
): PostEditorSession {
  return {
    mode,
    workspaceId,
    postId,
  };
}

/**
 * Verify that an asynchronous operation still belongs
 * to the currently active editor session.
 *
 * This is a frontend consistency guard, not a replacement
 * for API authorization.
 */
export function validatePostEditorSession(
  original: PostEditorSession,
  current: PostEditorSession,
): PostEditorSessionResult {
  if (original.mode !== current.mode) {
    return {
      valid: false,
      reason: "mode-changed",
    };
  }

  if (original.workspaceId !== current.workspaceId) {
    return {
      valid: false,
      reason: "workspace-changed",
    };
  }

  if (original.postId !== current.postId) {
    return {
      valid: false,
      reason: "post-changed",
    };
  }

  return {
    valid: true,
    reason: "valid",
  };
}

export function getPostEditorSessionError(
  result: PostEditorSessionResult,
): string | null {
  if (result.valid) {
    return null;
  }

  switch (result.reason) {
    case "workspace-changed":
      return (
        "The active workspace changed while Storm was " +
        "processing your request. Check your Posts page " +
        "before retrying."
      );

    case "post-changed":
      return (
        "The selected post changed while Storm was " +
        "processing your request."
      );

    case "mode-changed":
      return (
        "The editor mode changed while Storm was " + "processing your request."
      );

    default:
      return "The editor session is no longer current.";
  }
}
