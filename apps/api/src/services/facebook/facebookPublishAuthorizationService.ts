import mongoose from "mongoose";

import FacebookConnection from "../../models/FacebookConnection.js";

import {
  getUserWorkspaceById,
  isValidWorkspaceId,
} from "../workspaceService.js";

import type { AuthenticatedUser } from "../userProfileService.js";

import type { FacebookPublishInput } from "./facebookPublishInput.js";

/**
 * Public authorization result.
 *
 * Never expose encrypted or decrypted Page tokens.
 */
export type AuthorizedFacebookPublishTarget = {
  workspaceId: string;
  connectionId: string;
  facebookPageId: string;
};

/**
 * Error representing a rejected publishing target.
 */
export class FacebookPublishAuthorizationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);

    this.name = "FacebookPublishAuthorizationError";
  }
}

/**
 * Verify that an authenticated Storm user may
 * publish through a saved Facebook Page connection.
 *
 * This function does not:
 * - Decrypt Page access tokens.
 * - Call the Meta Graph API.
 * - Publish a Facebook post.
 */
export async function authorizeFacebookPublishTarget(
  authUser: AuthenticatedUser,
  input: FacebookPublishInput,
): Promise<AuthorizedFacebookPublishTarget> {
  const { workspaceId, facebookConnectionId } = input;

  // 1. Validate identifiers defensively.
  if (!isValidWorkspaceId(workspaceId)) {
    throw new FacebookPublishAuthorizationError(
      "A valid workspace is required.",
      400,
    );
  }

  if (!mongoose.isObjectIdOrHexString(facebookConnectionId)) {
    throw new FacebookPublishAuthorizationError(
      "A valid Facebook connection is required.",
      400,
    );
  }

  // 2. Verify the authenticated user's workspace access.
  const workspace = await getUserWorkspaceById(authUser, workspaceId);

  if (!workspace) {
    throw new FacebookPublishAuthorizationError("Workspace not found.", 404);
  }

  // 3. Retrieve the connection from the same workspace.
  //
  // Do not select encrypted tokens here.
  const connection = await FacebookConnection.findOne({
    _id: facebookConnectionId,
    workspaceId,
  })
    .select("_id facebookPageId status tasks")
    .lean();

  if (!connection) {
    throw new FacebookPublishAuthorizationError(
      "Facebook connection not found.",
      404,
    );
  }

  // 4. Reject inactive connections.
  if (connection.status !== "connected") {
    throw new FacebookPublishAuthorizationError(
      "Facebook connection is not active. Reconnect the Page.",
      409,
    );
  }

  // 5. Verify the stored Page task.
  //
  // This is a fail-closed check: if the required
  // permission metadata was not persisted, the
  // connection cannot be authorized for publishing.
  const tasks = (
    connection as unknown as {
      tasks?: unknown;
    }
  ).tasks;

  if (!Array.isArray(tasks) || !tasks.includes("CREATE_CONTENT")) {
    throw new FacebookPublishAuthorizationError(
      "Facebook Page publishing permission is unavailable.",
      403,
    );
  }

  // 6. Return only the metadata needed to identify
  // the authorized publishing target.
  return {
    workspaceId,
    connectionId: String(connection._id),
    facebookPageId: connection.facebookPageId,
  };
}
