import LinkedInConnection from "../../models/LinkedInConnection.js";
import {
  getUserWorkspaceById,
  isValidWorkspaceId,
} from "../workspaceService.js";
import type { AuthenticatedUser } from "../userProfileService.js";
import { LinkedInConnectionError } from "./linkedinConnectionService.js";

export type LinkedInConnectionStatus = {
  connected: boolean;
  connection: null | {
    id: string;
    workspaceId: string;
    linkedinMemberId: string;
    displayName?: string;
    profilePictureUrl?: string;
    tokenExpiresAt: Date;
    status: "connected" | "expired" | "revoked";
  };
};

export async function getLinkedInConnectionStatus(
  authUser: AuthenticatedUser,
  workspaceId: string,
): Promise<LinkedInConnectionStatus> {
  if (!isValidWorkspaceId(workspaceId)) {
    throw new LinkedInConnectionError("Workspace not found.", 404);
  }

  if (!authUser.id.trim()) {
    throw new LinkedInConnectionError("Authentication is required.", 401);
  }

  const workspace = await getUserWorkspaceById(authUser, workspaceId);

  if (!workspace) {
    throw new LinkedInConnectionError("Workspace not found.", 404);
  }

  const connection = await LinkedInConnection.findOne({
    workspaceId: workspace._id,
  })
    .select(
      "_id workspaceId linkedinMemberId displayName profilePictureUrl tokenExpiresAt status",
    )
    .sort({ updatedAt: -1 })
    .lean();

  if (!connection) {
    return {
      connected: false,
      connection: null,
    };
  }

  const effectiveStatus =
    connection.status === "connected" &&
    connection.tokenExpiresAt.getTime() <= Date.now()
      ? "expired"
      : connection.status;

  return {
    connected: effectiveStatus === "connected",
    connection: {
      id: connection._id.toString(),
      workspaceId: connection.workspaceId.toString(),
      linkedinMemberId: connection.linkedinMemberId,
      ...(connection.displayName
        ? { displayName: connection.displayName }
        : {}),
      ...(connection.profilePictureUrl
        ? { profilePictureUrl: connection.profilePictureUrl }
        : {}),
      tokenExpiresAt: connection.tokenExpiresAt,
      status: effectiveStatus,
    },
  };
}
