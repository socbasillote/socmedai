import LinkedInConnection from "../../models/LinkedInConnection.js";
import {
  getUserWorkspaceById,
  isValidWorkspaceId,
} from "../workspaceService.js";
import type { AuthenticatedUser } from "../userProfileService.js";
import { encryptLinkedInToken } from "./linkedinTokenEncryptionService.js";
import type { LinkedInTokenResponse } from "./linkedinTokenService.js";

export class LinkedInConnectionError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "LinkedInConnectionError";
  }
}

export type LinkedInProfile = {
  memberId: string;
  displayName?: string;
  profilePictureUrl?: string;
};

export type LinkedInConnectionSummary = {
  id: string;
  workspaceId: string;
  linkedinMemberId: string;
  displayName?: string;
  profilePictureUrl?: string;
  tokenExpiresAt: Date;
  refreshTokenExpiresAt?: Date;
  scopes: string[];
  status: "connected" | "expired" | "revoked";
};

type SaveLinkedInConnectionInput = {
  authUser: AuthenticatedUser;
  workspaceId: string;
  profile: LinkedInProfile;
  tokens: LinkedInTokenResponse;
};

export async function saveLinkedInConnection({
  authUser,
  workspaceId,
  profile,
  tokens,
}: SaveLinkedInConnectionInput): Promise<LinkedInConnectionSummary> {
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

  if (!profile.memberId.trim()) {
    throw new LinkedInConnectionError(
      "LinkedIn did not return a valid member identity.",
      502,
    );
  }

  const now = Date.now();
  const tokenExpiresAt = new Date(now + tokens.expires_in * 1000);

  const refreshTokenExpiresAt =
    tokens.refresh_token && tokens.refresh_token_expires_in
      ? new Date(now + tokens.refresh_token_expires_in * 1000)
      : undefined;

  const setFields: Record<string, unknown> = {
    connectedByUserId: authUser.id,
    accessTokenEncrypted: encryptLinkedInToken(tokens.access_token),
    tokenExpiresAt,
    scopes: tokens.scope ? tokens.scope.split(/\s+/).filter(Boolean) : [],
    status: "connected",
  };

  const unsetFields: Record<string, 1> = {};

  if (tokens.refresh_token) {
    setFields.refreshTokenEncrypted = encryptLinkedInToken(
      tokens.refresh_token,
    );
  } else {
    unsetFields.refreshTokenEncrypted = 1;
    unsetFields.refreshTokenExpiresAt = 1;
  }

  if (refreshTokenExpiresAt) {
    setFields.refreshTokenExpiresAt = refreshTokenExpiresAt;
  }

  if (profile.displayName) {
    setFields.displayName = profile.displayName;
  }

  if (profile.profilePictureUrl) {
    setFields.profilePictureUrl = profile.profilePictureUrl;
  }

  const updateDocument: Record<string, unknown> = {
    $set: setFields,
    $setOnInsert: {
      workspaceId: workspace._id,
      linkedinMemberId: profile.memberId,
    },
  };

  if (Object.keys(unsetFields).length > 0) {
    updateDocument.$unset = unsetFields;
  }

  const connection = await LinkedInConnection.findOneAndUpdate(
    {
      workspaceId: workspace._id,
      linkedinMemberId: profile.memberId,
    },
    updateDocument,
    {
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    },
  );

  if (!connection) {
    throw new LinkedInConnectionError(
      "Unable to save the LinkedIn connection.",
      500,
    );
  }

  return {
    id: connection._id.toString(),
    workspaceId: connection.workspaceId.toString(),
    linkedinMemberId: connection.linkedinMemberId,
    ...(connection.displayName ? { displayName: connection.displayName } : {}),
    ...(connection.profilePictureUrl
      ? { profilePictureUrl: connection.profilePictureUrl }
      : {}),
    tokenExpiresAt: connection.tokenExpiresAt,
    ...(connection.refreshTokenExpiresAt
      ? { refreshTokenExpiresAt: connection.refreshTokenExpiresAt }
      : {}),
    scopes: connection.scopes,
    status: connection.status,
  };
}

type DisconnectLinkedInConnectionInput = {
  authUser: AuthenticatedUser;
  workspaceId: string;
  connectionId: string;
};

export async function disconnectLinkedInConnection({
  authUser,
  workspaceId,
  connectionId,
}: DisconnectLinkedInConnectionInput): Promise<{ disconnected: true }> {
  if (!isValidWorkspaceId(workspaceId)) {
    throw new LinkedInConnectionError("Workspace not found.", 404);
  }

  if (!authUser.id.trim()) {
    throw new LinkedInConnectionError("Authentication is required.", 401);
  }

  if (!isValidWorkspaceId(connectionId)) {
    throw new LinkedInConnectionError("LinkedIn connection not found.", 404);
  }

  const workspace = await getUserWorkspaceById(authUser, workspaceId);

  if (!workspace) {
    throw new LinkedInConnectionError("Workspace not found.", 404);
  }

  const connection = await LinkedInConnection.findOneAndDelete({
    _id: connectionId,
    workspaceId: workspace._id,
  });

  if (!connection) {
    throw new LinkedInConnectionError("LinkedIn connection not found.", 404);
  }

  return { disconnected: true };
}
