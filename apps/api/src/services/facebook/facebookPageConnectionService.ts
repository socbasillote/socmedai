import mongoose, { type ClientSession, type Connection } from "mongoose";

import FacebookConnection from "../../models/FacebookConnection.js";
import FacebookOAuthSession from "../../models/FacebookOAuthSession.js";
import { createHash } from "node:crypto";

import type { AuthenticatedUser } from "../userProfileService.js";

import { getUserWorkspaceById } from "../workspaceService.js";

import {
  encryptFacebookToken,
  decryptFacebookToken,
} from "./facebookTokenEncryptionService.js";

import UserProfile from "../../models/UserProfile.js";
import Workspace from "../../models/Workspace.js";

export class FacebookPageConnectionError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "FacebookPageConnectionError";
  }
}

export type ConnectFacebookPagesInput = {
  sessionToken: string;
  authUser: AuthenticatedUser;
  workspaceId: string;
  selectedPageIds: string[];
};

export type FacebookPageConnectionValidationDependencies = {
  connection?: Connection;
};

export type FacebookPageConnectionSummary = {
  facebookPageId: string;
  pageName: string;
  status: "connected" | "expired" | "revoked";
};

export type ConnectFacebookPagesResult = {
  connections: FacebookPageConnectionSummary[];
};

export type ValidatedFacebookPageConnectionRequest = {
  sessionToken: string;
  authUser: AuthenticatedUser;
  workspaceId: mongoose.Types.ObjectId;
  selectedPageIds: string[];
};

export type ClaimedFacebookOAuthPage = {
  facebookPageId: string;
  pageName: string;
  pageAccessTokenEncrypted: string;
  tasks: string[];
};

export type ClaimedFacebookOAuthSession = {
  facebookUserId: string;
  pages: ClaimedFacebookOAuthPage[];
};

export type ClaimFacebookOAuthSessionInput = {
  sessionToken: string;
  authUser: AuthenticatedUser;
  workspaceId: mongoose.Types.ObjectId;
  mongoSession: ClientSession;
  connection?: Connection;
};

export type ValidateFacebookPageSelectionInput = {
  selectedPageIds: string[];
  claimedSession: ClaimedFacebookOAuthSession;
};

export type SelectedFacebookOAuthPage = {
  facebookPageId: string;
  pageName: string;
  pageAccessTokenEncrypted: string;
  tasks: string[];
};

export type PersistFacebookPageConnectionInput = {
  workspaceId: mongoose.Types.ObjectId;
  connectedByUserId: string;
  facebookUserId: string;
  page: SelectedFacebookOAuthPage;
  mongoSession: ClientSession;
  connection?: Connection;
};

export async function validateFacebookPageConnectionRequest(
  {
    sessionToken,
    authUser,
    workspaceId,
    selectedPageIds,
  }: ConnectFacebookPagesInput,
  dependencies: FacebookPageConnectionValidationDependencies = {},
): Promise<ValidatedFacebookPageConnectionRequest> {
  // 1. Validate authentication.
  if (!authUser || typeof authUser.id !== "string" || !authUser.id.trim()) {
    throw new FacebookPageConnectionError("Authentication is required.", 401);
  }

  // 2. Validate workspace ID.
  if (
    typeof workspaceId !== "string" ||
    !mongoose.isValidObjectId(workspaceId)
  ) {
    throw new FacebookPageConnectionError(
      "A valid workspace is required.",
      400,
    );
  }

  // 3. Validate OAuth session token.
  if (
    typeof sessionToken !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(sessionToken)
  ) {
    throw new FacebookPageConnectionError(
      "Invalid Facebook OAuth session.",
      400,
    );
  }

  // 4. Validate selected Pages.
  if (!Array.isArray(selectedPageIds) || selectedPageIds.length === 0) {
    throw new FacebookPageConnectionError(
      "Select at least one Facebook Page.",
      400,
    );
  }

  // 5. Limit the number of selected Pages.
  const MAX_SELECTED_PAGES = 100;

  if (selectedPageIds.length > MAX_SELECTED_PAGES) {
    throw new FacebookPageConnectionError(
      "Too many Facebook Pages selected.",
      400,
    );
  }

  // 6. Validate individual Page IDs.
  for (const pageId of selectedPageIds) {
    if (typeof pageId !== "string" || !/^[0-9]+$/.test(pageId)) {
      throw new FacebookPageConnectionError("Invalid Facebook Page ID.", 400);
    }
  }

  // 7. Reject duplicate Page IDs.
  const uniquePageIds = new Set(selectedPageIds);

  if (uniquePageIds.size !== selectedPageIds.length) {
    throw new FacebookPageConnectionError(
      "Duplicate Facebook Pages are not allowed.",
      400,
    );
  }

  // 8. Verify workspace ownership.
  const connection = dependencies.connection;

  let workspace;

  if (connection && connection !== mongoose.connection) {
    // Use the injected connection for isolated integration tests.
    const UserProfileModel = connection.model<typeof UserProfile>(
      UserProfile.modelName,
      UserProfile.schema,
    );

    const WorkspaceModel = connection.model<typeof Workspace>(
      Workspace.modelName,
      Workspace.schema,
    );

    // Find the authenticated user's profile.
    const profile = await UserProfileModel.findOne({
      supabaseUserId: authUser.id,
    })
      .select("_id")
      .lean();

    if (!profile) {
      throw new FacebookPageConnectionError("Workspace access denied.", 403);
    }

    // Verify that this profile owns the requested workspace.
    workspace = await WorkspaceModel.findOne({
      _id: workspaceId,
      ownerUserId: profile._id,
    })
      .select("_id name ownerUserId settings createdAt updatedAt")
      .lean();
  } else {
    // Preserve existing production authorization behavior.
    workspace = await getUserWorkspaceById(authUser, workspaceId);
  }

  if (!workspace) {
    throw new FacebookPageConnectionError("Workspace access denied.", 403);
  }

  // 9. Return validated data.
  return {
    sessionToken,
    authUser,
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    selectedPageIds: [...selectedPageIds],
  };
}

export async function claimFacebookOAuthSession({
  sessionToken,
  authUser,
  workspaceId,
  mongoSession,
  connection,
}: ClaimFacebookOAuthSessionInput): Promise<ClaimedFacebookOAuthSession> {
  // 1. Validate the session token.
  if (
    typeof sessionToken !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(sessionToken)
  ) {
    throw new FacebookPageConnectionError(
      "Invalid Facebook OAuth session.",
      400,
    );
  }

  // 2. Validate the authenticated user.
  if (!authUser || typeof authUser.id !== "string" || !authUser.id.trim()) {
    throw new FacebookPageConnectionError("Authentication is required.", 401);
  }

  // 3. Validate the workspace ID.
  if (!(workspaceId instanceof mongoose.Types.ObjectId)) {
    throw new FacebookPageConnectionError(
      "A valid workspace is required.",
      400,
    );
  }

  // 4. Require an active MongoDB transaction.
  if (!mongoSession || !mongoSession.inTransaction()) {
    throw new FacebookPageConnectionError(
      "An active database transaction is required.",
      500,
    );
  }

  // 5. Hash the temporary session token.
  const sessionHash = createHash("sha256").update(sessionToken).digest("hex");

  const OAuthSessionModel: typeof FacebookOAuthSession =
    connection && connection !== mongoose.connection
      ? connection.model<typeof FacebookOAuthSession>(
          FacebookOAuthSession.modelName,
          FacebookOAuthSession.schema,
        )
      : FacebookOAuthSession;

  // 6. Atomically claim the session inside the transaction.
  const oauthSession = await OAuthSessionModel.findOneAndDelete({
    sessionHash,
    supabaseUserId: authUser.id,
    workspaceId,
    expiresAt: {
      $gt: new Date(),
    },
  })
    .select(
      "facebookUserId pages.facebookPageId pages.pageName pages.pageAccessTokenEncrypted pages.tasks",
    )
    .session(mongoSession)
    .lean();

  // 7. Reject missing, expired, or previously consumed sessions.
  if (!oauthSession) {
    throw new FacebookPageConnectionError(
      "Facebook OAuth session is invalid, expired, or already used.",
      404,
    );
  }

  // 8. Return encrypted Page data for internal backend use.
  return {
    facebookUserId: oauthSession.facebookUserId,
    pages: oauthSession.pages.map((page: ClaimedFacebookOAuthPage) => ({
      facebookPageId: page.facebookPageId,
      pageName: page.pageName,
      pageAccessTokenEncrypted: page.pageAccessTokenEncrypted,
      tasks: [...page.tasks],
    })),
  };
}

export function validateFacebookPageSelection({
  selectedPageIds,
  claimedSession,
}: ValidateFacebookPageSelectionInput): SelectedFacebookOAuthPage[] {
  // 1. Require at least one selected Page.
  if (
    !Array.isArray(selectedPageIds) ||
    selectedPageIds.length === 0 ||
    selectedPageIds.length > 100
  ) {
    throw new FacebookPageConnectionError(
      "Invalid Facebook Page selection.",
      400,
    );
  }

  // 2. Validate selected Page IDs.
  if (
    selectedPageIds.some(
      (pageId) => typeof pageId !== "string" || !/^[0-9]+$/.test(pageId),
    )
  ) {
    throw new FacebookPageConnectionError(
      "Invalid Facebook Page selection.",
      400,
    );
  }

  // 3. Reject duplicate selected IDs.
  if (new Set(selectedPageIds).size !== selectedPageIds.length) {
    throw new FacebookPageConnectionError(
      "Duplicate Facebook Pages are not allowed.",
      400,
    );
  }

  // 4. Verify that the claimed session contains Pages.
  if (!claimedSession || !Array.isArray(claimedSession.pages)) {
    throw new FacebookPageConnectionError(
      "Facebook OAuth session contains no valid Pages.",
      400,
    );
  }

  // 5. Index the Pages discovered during OAuth.
  const discoveredPages = new Map<string, ClaimedFacebookOAuthPage>();

  for (const page of claimedSession.pages) {
    if (
      !page ||
      typeof page.facebookPageId !== "string" ||
      !/^[0-9]+$/.test(page.facebookPageId) ||
      typeof page.pageName !== "string" ||
      !page.pageName.trim() ||
      typeof page.pageAccessTokenEncrypted !== "string" ||
      !page.pageAccessTokenEncrypted.trim() ||
      !Array.isArray(page.tasks) ||
      page.tasks.some((task) => typeof task !== "string")
    ) {
      throw new FacebookPageConnectionError(
        "Facebook OAuth session contains invalid Page data.",
        400,
      );
    }

    if (discoveredPages.has(page.facebookPageId)) {
      throw new FacebookPageConnectionError(
        "Facebook OAuth session contains duplicate Pages.",
        400,
      );
    }

    discoveredPages.set(page.facebookPageId, page);
  }

  // 6. Verify every selected Page belongs to the session.
  const selectedPages: SelectedFacebookOAuthPage[] = [];

  for (const pageId of selectedPageIds) {
    const page = discoveredPages.get(pageId);

    if (!page) {
      throw new FacebookPageConnectionError(
        "One or more selected Facebook Pages are not available in this OAuth session.",
        400,
      );
    }

    // 7. Require Page-level publishing permission.
    if (!page.tasks.includes("CREATE_CONTENT")) {
      throw new FacebookPageConnectionError(
        "One or more selected Facebook Pages do not have publishing permission.",
        403,
      );
    }

    // 8. Copy the validated Page data.
    selectedPages.push({
      facebookPageId: page.facebookPageId,
      pageName: page.pageName,
      pageAccessTokenEncrypted: page.pageAccessTokenEncrypted,
      tasks: [...page.tasks],
    });
  }

  return selectedPages;
}

export async function persistFacebookPageConnection({
  workspaceId,
  connectedByUserId,
  facebookUserId,
  page,
  mongoSession,
  connection,
}: PersistFacebookPageConnectionInput): Promise<FacebookPageConnectionSummary> {
  // 1. Require an active MongoDB transaction.
  if (!mongoSession?.inTransaction()) {
    throw new FacebookPageConnectionError(
      "An active database transaction is required.",
      500,
    );
  }

  // 2. Validate workspace and user identifiers.
  if (!(workspaceId instanceof mongoose.Types.ObjectId)) {
    throw new FacebookPageConnectionError(
      "A valid workspace is required.",
      400,
    );
  }

  if (
    typeof connectedByUserId !== "string" ||
    !connectedByUserId.trim() ||
    typeof facebookUserId !== "string" ||
    !facebookUserId.trim()
  ) {
    throw new FacebookPageConnectionError(
      "Invalid Facebook connection identity.",
      400,
    );
  }

  // 3. Validate Page metadata.
  if (
    !page ||
    typeof page.facebookPageId !== "string" ||
    !/^[0-9]+$/.test(page.facebookPageId) ||
    typeof page.pageName !== "string" ||
    !page.pageName.trim() ||
    typeof page.pageAccessTokenEncrypted !== "string" ||
    !page.pageAccessTokenEncrypted.trim() ||
    !Array.isArray(page.tasks) ||
    !page.tasks.includes("CREATE_CONTENT")
  ) {
    throw new FacebookPageConnectionError(
      "Invalid Facebook Page connection data.",
      400,
    );
  }

  // 4. Decrypt the temporary OAuth session credential.
  const pageAccessToken = decryptFacebookToken(page.pageAccessTokenEncrypted);

  // 5. Encrypt the credential again for persistent storage.
  const pageAccessTokenEncrypted = encryptFacebookToken(pageAccessToken);

  const FacebookConnectionModel: typeof FacebookConnection =
    connection && connection !== mongoose.connection
      ? connection.model<typeof FacebookConnection>(
          FacebookConnection.modelName,
          FacebookConnection.schema,
        )
      : FacebookConnection;

  // 6. Create or reconnect the Page within the transaction.
  await FacebookConnectionModel.updateOne(
    {
      workspaceId,
      facebookPageId: page.facebookPageId,
    },
    {
      $set: {
        connectedByUserId,
        facebookUserId,
        pageName: page.pageName,
        pageAccessTokenEncrypted,
        status: "connected",
      },
      $setOnInsert: {
        scopes: [],
      },
    },
    {
      upsert: true,
      session: mongoSession,
      runValidators: true,
    },
  );

  // 7. Return safe metadata only.
  return {
    facebookPageId: page.facebookPageId,
    pageName: page.pageName,
    status: "connected",
  };
}

/**
 * Dependencies used by the Facebook Page connection orchestrator.
 *
 * Production uses the application's default Mongoose connection.
 * Integration tests can inject a dedicated test connection.
 */
export type ConnectFacebookPagesDependencies = {
  connection?: Connection;
};

/**
 * Completes Facebook Page connection after OAuth.
 *
 * Security guarantees:
 * - Authenticated workspace ownership is verified.
 * - OAuth session is claimed inside the transaction.
 * - Selected Pages must belong to that OAuth session.
 * - Each Page must have CREATE_CONTENT permission.
 * - Credentials remain encrypted in MongoDB.
 * - Session deletion and connection writes commit together.
 * - Only safe connection summaries are returned.
 */
export async function connectFacebookPages(
  input: ConnectFacebookPagesInput,
  dependencies: ConnectFacebookPagesDependencies = {},
): Promise<ConnectFacebookPagesResult> {
  // Validate the request and verify workspace ownership.
  const connection = dependencies.connection ?? mongoose.connection;

  const validated = await validateFacebookPageConnectionRequest(input, {
    connection,
  });

  // The transaction promise resolves only after commit succeeds.
  const connections = await connection.transaction(async (mongoSession) => {
    const claimedSession = await claimFacebookOAuthSession({
      sessionToken: validated.sessionToken,
      authUser: validated.authUser,
      workspaceId: validated.workspaceId,
      mongoSession,
      connection,
    });

    const selectedPages = validateFacebookPageSelection({
      selectedPageIds: validated.selectedPageIds,
      claimedSession,
    });

    const savedConnections: FacebookPageConnectionSummary[] = [];

    // MongoDB transactions require sequential operations.
    for (const page of selectedPages) {
      const savedConnection = await persistFacebookPageConnection({
        workspaceId: validated.workspaceId,
        connectedByUserId: validated.authUser.id,
        facebookUserId: claimedSession.facebookUserId,
        page,
        mongoSession,
        connection,
      });

      savedConnections.push(savedConnection);
    }

    return savedConnections;
  });

  // Never return success before the transaction commits.
  return {
    connections,
  };
}
