export type PostWorkspaceContext = {
  mode: "create" | "edit";
  activeWorkspaceId: string | null;
  postWorkspaceId: string | null;
};

export type PostWorkspaceContextResult = {
  valid: boolean;
  message: string | null;
};

export function validatePostWorkspaceContext({
  mode,
  activeWorkspaceId,
  postWorkspaceId,
}: PostWorkspaceContext): PostWorkspaceContextResult {
  if (!activeWorkspaceId) {
    return {
      valid: false,
      message: "Select an active workspace to continue.",
    };
  }

  if (mode === "create") {
    return {
      valid: true,
      message: null,
    };
  }

  if (!postWorkspaceId) {
    return {
      valid: false,
      message: "The draft's workspace could not be verified.",
    };
  }

  if (activeWorkspaceId !== postWorkspaceId) {
    return {
      valid: false,
      message:
        "This draft belongs to another workspace. " +
        "Switch to the draft's workspace before editing or publishing.",
    };
  }

  return {
    valid: true,
    message: null,
  };
}
