import FacebookConnection from "../../models/FacebookConnection.js";

import {
  getUserWorkspaceById,
  isValidWorkspaceId,
} from "../workspaceService.js";

import type { AuthenticatedUser } from "../userProfileService.js";

export class FacebookConnectionQueryError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "FacebookConnectionQueryError";
  }
}

export type FacebookConnectionSummary = {
  id: string;
  facebookPageId: string;
  pageName: string;
  status: "connected" | "expired" | "revoked";
  canPublish: boolean;
};

/**
 * Retrieve Facebook Page connections for a workspace.
 *
 * Security:
 * - Requires an authenticated Storm user.
 * - Verifies workspace access.
 * - Returns only safe connection metadata.
 * - Never returns Facebook access tokens.
 */
export async function listFacebookConnections(
  authUser: AuthenticatedUser,
  workspaceId: string,
): Promise<FacebookConnectionSummary[]> {
  // 1. Validate workspace ID.
  if (!isValidWorkspaceId(workspaceId)) {
    throw new FacebookConnectionQueryError(
      "A valid workspace is required.",
      400,
    );
  }

  // 2. Verify access to the workspace.
  const workspace = await getUserWorkspaceById(authUser, workspaceId);

  if (!workspace) {
    throw new FacebookConnectionQueryError("Workspace not found.", 404);
  }

  // 3. Retrieve only non-sensitive fields.
  const connections = await FacebookConnection.find({
    workspaceId,
  })
    .select("_id facebookPageId pageName status tasks")
    .sort({ pageName: 1 })
    .lean();

  // 4. Map database documents to public API data.
  return connections.map((connection) => ({
    id: String(connection._id),
    facebookPageId: connection.facebookPageId,
    pageName: connection.pageName,
    status: connection.status,
    canPublish:
      connection.status === "connected" &&
      Array.isArray(connection.tasks) &&
      connection.tasks.includes("CREATE_CONTENT"),
  }));
}
