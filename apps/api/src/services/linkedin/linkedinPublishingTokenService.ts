import LinkedInConnection from "../../models/LinkedInConnection.js";
import {
  getUserWorkspaceById,
  isValidWorkspaceId,
} from "../workspaceService.js";
import type { AuthenticatedUser } from "../userProfileService.js";
import { LinkedInConnectionError } from "./linkedinConnectionService.js";
import { decryptLinkedInToken } from "./linkedinTokenEncryptionService.js";

export type LinkedInPublishingCredentials = {
  accessToken: string;
  linkedinMemberId: string;
  connectionId: string;
};

type GetLinkedInPublishingCredentialsInput = {
  authUser: AuthenticatedUser;
  workspaceId: string;
  connectionId: string;
};

export async function getLinkedInPublishingCredentials({
  authUser,
  workspaceId,
  connectionId,
}: GetLinkedInPublishingCredentialsInput): Promise<LinkedInPublishingCredentials> {
  if (!isValidWorkspaceId(workspaceId)) {
    throw new LinkedInConnectionError("Workspace not found.", 404);
  }

  if (!isValidWorkspaceId(connectionId)) {
    throw new LinkedInConnectionError("LinkedIn connection not found.", 404);
  }

  if (!authUser.id.trim()) {
    throw new LinkedInConnectionError("Authentication is required.", 401);
  }

  const workspace = await getUserWorkspaceById(authUser, workspaceId);

  if (!workspace) {
    throw new LinkedInConnectionError("Workspace not found.", 404);
  }

  const connection = await LinkedInConnection.findOne({
    _id: connectionId,
    workspaceId: workspace._id,
  })
    .select(
      "_id linkedinMemberId status tokenExpiresAt scopes +accessTokenEncrypted",
    )
    .lean();

  if (!connection) {
    throw new LinkedInConnectionError(
      "Connect a LinkedIn account before publishing.",
      409,
    );
  }

  if (connection.status !== "connected") {
    throw new LinkedInConnectionError(
      "The LinkedIn connection is not active. Reconnect LinkedIn before publishing.",
      409,
    );
  }

  if (connection.tokenExpiresAt.getTime() <= Date.now()) {
    throw new LinkedInConnectionError(
      "The LinkedIn access token has expired. Reconnect LinkedIn before publishing.",
      409,
    );
  }

  if (!connection.scopes.includes("w_member_social")) {
    throw new LinkedInConnectionError(
      "The LinkedIn connection lacks permission to publish posts. Reconnect and authorize post publishing.",
      403,
    );
  }

  if (!connection.accessTokenEncrypted) {
    throw new LinkedInConnectionError(
      "The stored LinkedIn access token is unavailable. Reconnect LinkedIn.",
      409,
    );
  }

  let accessToken: string;

  try {
    accessToken = decryptLinkedInToken(connection.accessTokenEncrypted);
  } catch {
    throw new LinkedInConnectionError(
      "Unable to decrypt the LinkedIn access token. Check server configuration or reconnect LinkedIn.",
      503,
    );
  }

  return {
    accessToken,
    linkedinMemberId: connection.linkedinMemberId,
    connectionId: connection._id.toString(),
  };
}
