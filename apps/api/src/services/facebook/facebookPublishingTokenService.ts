import mongoose from "mongoose";

import FacebookConnection from "../../models/FacebookConnection.js";

import {
  getUserWorkspaceById,
  isValidWorkspaceId,
} from "../workspaceService.js";

import type { AuthenticatedUser } from "../userProfileService.js";

import { decryptFacebookToken } from "./facebookTokenEncryptionService.js";

/**
 * Credentials intended exclusively for backend publishing.
 *
 * Never serialize this object into an HTTP response.
 */
export type FacebookPublishingCredentials = {
  connectionId: string;
  facebookPageId: string;
  pageAccessToken: string;
};

export type GetFacebookPublishingCredentialsInput = {
  authUser: AuthenticatedUser;
  workspaceId: string;
  connectionId: string;
};

export class FacebookPublishingCredentialsError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);

    this.name = "FacebookPublishingCredentialsError";
  }
}

/**
 * Retrieve authorized Facebook Page publishing credentials.
 *
 * Security:
 * - Requires an authenticated Storm user.
 * - Verifies workspace access.
 * - Restricts connection lookup to that workspace.
 * - Requires an active Page connection.
 * - Requires CREATE_CONTENT permission.
 * - Decrypts the Page token on the backend only.
 *
 * This service does not publish any Facebook posts.
 */
export async function getFacebookPublishingCredentials({
  authUser,
  workspaceId,
  connectionId,
}: GetFacebookPublishingCredentialsInput): Promise<FacebookPublishingCredentials> {
  // 1. Require authentication.
  if (!authUser || typeof authUser.id !== "string" || !authUser.id.trim()) {
    throw new FacebookPublishingCredentialsError(
      "Authentication is required.",
      401,
    );
  }

  // 2. Validate workspace ID.
  if (!isValidWorkspaceId(workspaceId)) {
    throw new FacebookPublishingCredentialsError(
      "A valid workspace is required.",
      400,
    );
  }

  // 3. Validate Facebook connection ID.
  if (
    typeof connectionId !== "string" ||
    !mongoose.isObjectIdOrHexString(connectionId)
  ) {
    throw new FacebookPublishingCredentialsError(
      "A valid Facebook connection is required.",
      400,
    );
  }

  // 4. Verify workspace access.
  const workspace = await getUserWorkspaceById(authUser, workspaceId);

  if (!workspace) {
    throw new FacebookPublishingCredentialsError("Workspace not found.", 404);
  }

  // 5. Retrieve the connection from this workspace only.
  //
  // The token field has select: false in the schema,
  // so explicitly include it for this trusted service.
  const connection = await FacebookConnection.findOne({
    _id: connectionId,
    workspaceId: workspace._id,
  })
    .select("_id facebookPageId status tasks +pageAccessTokenEncrypted")
    .lean();

  if (!connection) {
    throw new FacebookPublishingCredentialsError(
      "Facebook connection not found.",
      404,
    );
  }

  // 6. Require an active connection.
  if (connection.status !== "connected") {
    throw new FacebookPublishingCredentialsError(
      "Facebook connection is not active. Reconnect the Page.",
      409,
    );
  }

  // 7. Require Page-level publishing permission.
  if (
    !Array.isArray(connection.tasks) ||
    !connection.tasks.includes("CREATE_CONTENT")
  ) {
    throw new FacebookPublishingCredentialsError(
      "Facebook Page publishing permission is unavailable.",
      403,
    );
  }

  // 8. Verify stored credential availability.
  if (
    typeof connection.pageAccessTokenEncrypted !== "string" ||
    !connection.pageAccessTokenEncrypted.trim()
  ) {
    throw new FacebookPublishingCredentialsError(
      "Facebook Page credentials are unavailable. Reconnect the Page.",
      409,
    );
  }

  // 9. Decrypt the credential exclusively on the backend.
  let pageAccessToken: string;

  try {
    pageAccessToken = decryptFacebookToken(connection.pageAccessTokenEncrypted);

    if (typeof pageAccessToken !== "string" || !pageAccessToken.trim()) {
      throw new Error("Invalid decrypted credential.");
    }
  } catch {
    throw new FacebookPublishingCredentialsError(
      "Unable to access Facebook Page credentials. Reconnect the Page or check server configuration.",
      503,
    );
  }

  // 10. Return credentials for trusted backend consumers.
  return {
    connectionId: String(connection._id),
    facebookPageId: connection.facebookPageId,
    pageAccessToken,
  };
}
