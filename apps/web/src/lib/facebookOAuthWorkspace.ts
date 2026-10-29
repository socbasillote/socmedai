const FACEBOOK_OAUTH_WORKSPACE_KEY = "storm:facebook-oauth-workspace";

/**
 * Remember which workspace initiated Facebook OAuth.
 *
 * This value is temporary and scoped to the browser tab.
 */
export function storeFacebookOAuthWorkspaceId(workspaceId: string): void {
  if (!workspaceId.trim()) {
    throw new Error("A workspace ID is required.");
  }

  try {
    sessionStorage.setItem(FACEBOOK_OAUTH_WORKSPACE_KEY, workspaceId);
  } catch {
    throw new Error(
      "Unable to save the Facebook OAuth workspace. Please enable browser session storage and try again.",
    );
  }
}

/**
 * Retrieve the workspace that initiated Facebook OAuth.
 */
export function readFacebookOAuthWorkspaceId(): string | null {
  try {
    return sessionStorage.getItem(FACEBOOK_OAUTH_WORKSPACE_KEY);
  } catch {
    return null;
  }
}

/**
 * Remove the temporary workspace reference.
 *
 * Call this after successful connection or when
 * the OAuth flow is explicitly cancelled.
 */
export function clearFacebookOAuthWorkspaceId(): void {
  try {
    sessionStorage.removeItem(FACEBOOK_OAUTH_WORKSPACE_KEY);
  } catch {
    // Ignore storage failures during cleanup.
  }
}
