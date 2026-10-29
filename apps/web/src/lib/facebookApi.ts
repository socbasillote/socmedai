import { apiFetch } from "./api";

/**
 * A Facebook Page discovered during the OAuth flow.
 *
 * Page access tokens are intentionally excluded.
 */
export type FacebookOAuthPage = {
  facebookPageId: string;
  pageName: string;
  tasks: string[];
};

/**
 * Temporary Facebook OAuth session returned by Storm.
 */
export type FacebookOAuthSession = {
  workspaceId: string;
  expiresAt: string;
  pages: FacebookOAuthPage[];
};

/**
 * A Facebook Page successfully connected to a workspace.
 */
export type FacebookPageConnection = {
  facebookPageId: string;
  pageName: string;
  status: "connected" | "expired" | "revoked";
};

/**
 * Response from the Facebook Page connection endpoint.
 */
export type ConnectFacebookPagesResponse = {
  connections: FacebookPageConnection[];
};

/**
 * A Facebook Page already connected to Storm.
 *
 * This represents a saved MongoDB connection,
 * not a temporary OAuth discovery result.
 */
export type FacebookConnectionInfo = {
  id: string;
  facebookPageId: string;
  pageName: string;
  status: "connected" | "expired" | "revoked";
};

/**
 * Response from the Facebook connections endpoint.
 */
export type FacebookConnectionsResponse = {
  connections: FacebookConnectionInfo[];
};

/**
 * Retrieve Facebook Pages connected to a workspace.
 *
 * The backend:
 * - Requires Supabase authentication.
 * - Verifies workspace access.
 * - Returns only safe Page metadata.
 * - Excludes Facebook access tokens.
 */
export async function getFacebookConnections(
  workspaceId: string,
): Promise<FacebookConnectionsResponse> {
  const normalizedWorkspaceId = workspaceId.trim();

  if (!normalizedWorkspaceId) {
    throw new Error("Select a workspace before checking Facebook connections.");
  }

  const params = new URLSearchParams({
    workspaceId: normalizedWorkspaceId,
  });

  return apiFetch<FacebookConnectionsResponse>(
    `/api/facebook/connections?${params.toString()}`,
    {
      method: "GET",
    },
  );
}

/**
 * Retrieve the temporary Facebook OAuth session.
 *
 * The session contains safe Page metadata only.
 * Facebook access tokens must never be returned.
 */
export async function getFacebookOAuthSession(
  workspaceId: string,
): Promise<FacebookOAuthSession> {
  if (!workspaceId.trim()) {
    throw new Error("A workspace ID is required.");
  }

  const params = new URLSearchParams({
    workspaceId,
  });

  return apiFetch<FacebookOAuthSession>(
    `/api/facebook/oauth/session?${params.toString()}`,
    {
      method: "GET",
      credentials: "include",
    },
  );
}

/**
 * Connect one or more Facebook Pages to the workspace.
 *
 * The backend validates:
 * - Supabase authentication
 * - Request Origin
 * - Workspace ownership
 * - Temporary OAuth session
 * - Selected Page IDs
 * - Facebook Page publishing permissions
 *
 * The backend also consumes the OAuth session
 * and clears its cookie after successful connection.
 */
export async function connectSelectedFacebookPages(
  workspaceId: string,
  facebookPageIds: string[],
): Promise<ConnectFacebookPagesResponse> {
  if (!workspaceId.trim()) {
    throw new Error("A workspace ID is required.");
  }

  if (facebookPageIds.length === 0) {
    throw new Error("Select at least one Facebook Page.");
  }

  if (facebookPageIds.length > 100) {
    throw new Error("You can select up to 100 Facebook Pages.");
  }

  if (
    facebookPageIds.some(
      (pageId) => typeof pageId !== "string" || !/^[0-9]+$/.test(pageId),
    )
  ) {
    throw new Error("One or more Facebook Page IDs are invalid.");
  }

  if (new Set(facebookPageIds).size !== facebookPageIds.length) {
    throw new Error("Duplicate Facebook Pages are not allowed.");
  }

  return apiFetch<ConnectFacebookPagesResponse>("/api/facebook/pages/connect", {
    method: "POST",
    credentials: "include",
    body: JSON.stringify({
      workspaceId,
      facebookPageIds,
    }),
  });
}

/**
 * Response from the Facebook OAuth initiation endpoint.
 */
type FacebookConnectResponse = {
  authorizationUrl: string;
};

/**
 * Start the Facebook OAuth authorization flow.
 *
 * This function only retrieves the authorization URL.
 * Browser redirection and temporary workspace
 * persistence are handled by the React hook.
 */
export async function startFacebookConnect(
  workspaceId: string,
): Promise<string> {
  const normalizedWorkspaceId = workspaceId.trim();

  if (!normalizedWorkspaceId) {
    throw new Error("Select a workspace before connecting Facebook.");
  }

  const response = await apiFetch<FacebookConnectResponse>(
    "/api/facebook/connect",
    {
      method: "POST",
      body: JSON.stringify({
        workspaceId: normalizedWorkspaceId,
      }),
    },
  );

  if (typeof response.authorizationUrl !== "string") {
    throw new Error("The API returned an invalid Facebook authorization URL.");
  }

  let authorizationUrl: URL;

  try {
    authorizationUrl = new URL(response.authorizationUrl);
  } catch {
    throw new Error("The API returned an invalid Facebook authorization URL.");
  }

  const validFacebookHost =
    authorizationUrl.hostname === "www.facebook.com" ||
    authorizationUrl.hostname === "facebook.com";

  const validOAuthPath = /^\/(?:v\d+\.\d+\/)?dialog\/oauth\/?$/.test(
    authorizationUrl.pathname,
  );

  if (
    authorizationUrl.protocol !== "https:" ||
    !validFacebookHost ||
    !validOAuthPath ||
    authorizationUrl.username ||
    authorizationUrl.password
  ) {
    throw new Error("The API returned an invalid Facebook authorization URL.");
  }

  return authorizationUrl.toString();
}
