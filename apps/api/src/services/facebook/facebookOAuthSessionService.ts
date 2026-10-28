import { createHash, randomBytes } from "node:crypto";

import mongoose from "mongoose";

import FacebookOAuthSession from "../../models/FacebookOAuthSession.js";
import { getUserWorkspaceById } from "../workspaceService.js";
import type { AuthenticatedUser } from "../userProfileService.js";

import {
  encryptFacebookToken,
  decryptFacebookToken,
  FacebookTokenEncryptionError,
} from "./facebookTokenEncryptionService.js";

import type { DiscoveredFacebookPage } from "./facebookPageDiscoveryService.js";

const SESSION_TTL_MS = 10 * 60 * 1000;

export class FacebookOAuthSessionError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "FacebookOAuthSessionError";
  }
}

export type FacebookOAuthSessionPageSummary = {
  facebookPageId: string;
  pageName: string;
  tasks: string[];
};

export type CreatedFacebookOAuthSession = {
  sessionToken: string;
  expiresAt: Date;
  pages: FacebookOAuthSessionPageSummary[];
};

export type CreateFacebookOAuthSessionInput = {
  supabaseUserId: string;
  workspaceId: string;
  facebookUserId: string;
  pages: DiscoveredFacebookPage[];
};

export type GetFacebookOAuthSessionInput = {
  sessionToken: string;
  authUser: AuthenticatedUser;
  workspaceId: string;
};

export type FacebookOAuthSessionDetails = {
  expiresAt: Date;
  pages: FacebookOAuthSessionPageSummary[];
};

export type ConsumeFacebookOAuthSessionInput = {
  sessionToken: string;
  authUser: AuthenticatedUser;
  workspaceId: string;
};

export type ConsumedFacebookOAuthSessionPage = {
  facebookPageId: string;
  pageName: string;
  pageAccessToken: string;
  tasks: string[];
};

export type ConsumedFacebookOAuthSession = {
  facebookUserId: string;
  pages: ConsumedFacebookOAuthSessionPage[];
};

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createFacebookOAuthSession({
  supabaseUserId,
  workspaceId,
  facebookUserId,
  pages,
}: CreateFacebookOAuthSessionInput): Promise<CreatedFacebookOAuthSession> {
  // Validate the authenticated user.
  if (typeof supabaseUserId !== "string" || !supabaseUserId.trim()) {
    throw new FacebookOAuthSessionError(
      "An authenticated user is required.",
      401,
    );
  }

  // Validate the workspace.
  if (
    typeof workspaceId !== "string" ||
    !mongoose.isValidObjectId(workspaceId)
  ) {
    throw new FacebookOAuthSessionError("A valid workspace is required.", 400);
  }

  // Validate the Facebook user.
  if (typeof facebookUserId !== "string" || !facebookUserId.trim()) {
    throw new FacebookOAuthSessionError(
      "A valid Facebook user is required.",
      400,
    );
  }

  // Validate discovered Pages.
  if (!Array.isArray(pages)) {
    throw new FacebookOAuthSessionError(
      "Facebook Pages must be an array.",
      400,
    );
  }

  const seenPageIds = new Set<string>();

  for (const page of pages) {
    if (
      !page ||
      typeof page.facebookPageId !== "string" ||
      !page.facebookPageId.trim() ||
      typeof page.pageName !== "string" ||
      !page.pageName.trim() ||
      typeof page.pageAccessToken !== "string" ||
      !page.pageAccessToken.trim() ||
      !Array.isArray(page.tasks) ||
      !page.tasks.every((task) => typeof task === "string")
    ) {
      throw new FacebookOAuthSessionError(
        "Facebook Page data is invalid.",
        400,
      );
    }

    if (seenPageIds.has(page.facebookPageId)) {
      throw new FacebookOAuthSessionError(
        "Duplicate Facebook Pages are not allowed.",
        400,
      );
    }

    seenPageIds.add(page.facebookPageId);
  }

  // Generate a cryptographically secure session token.
  const sessionToken = randomBytes(32).toString("base64url");

  // Store only its hash.
  const sessionHash = hashSessionToken(sessionToken);

  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  // Encrypt Page tokens before database persistence.
  let encryptedPages: Array<{
    facebookPageId: string;
    pageName: string;
    pageAccessTokenEncrypted: string;
    tasks: string[];
  }>;

  try {
    encryptedPages = pages.map((page) => ({
      facebookPageId: page.facebookPageId,
      pageName: page.pageName,
      pageAccessTokenEncrypted: encryptFacebookToken(page.pageAccessToken),
      tasks: [...page.tasks],
    }));
  } catch (error) {
    if (error instanceof FacebookTokenEncryptionError) {
      throw new FacebookOAuthSessionError(
        "Facebook token encryption is unavailable.",
        503,
      );
    }

    throw error;
  }

  // Persist the temporary OAuth session.
  await FacebookOAuthSession.create({
    sessionHash,
    supabaseUserId,
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    facebookUserId,
    pages: encryptedPages,
    expiresAt,
  });

  // Return only safe Page metadata.
  return {
    sessionToken,
    expiresAt,
    pages: pages.map((page) => ({
      facebookPageId: page.facebookPageId,
      pageName: page.pageName,
      tasks: [...page.tasks],
    })),
  };
}

export async function getFacebookOAuthSession({
  sessionToken,
  authUser,
  workspaceId,
}: GetFacebookOAuthSessionInput): Promise<FacebookOAuthSessionDetails> {
  // 1. Validate the session token.
  if (
    typeof sessionToken !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(sessionToken)
  ) {
    throw new FacebookOAuthSessionError("Invalid Facebook OAuth session.", 400);
  }

  // 2. Validate the authenticated user.
  if (!authUser || typeof authUser.id !== "string" || !authUser.id.trim()) {
    throw new FacebookOAuthSessionError("Authentication is required.", 401);
  }

  // 3. Validate the workspace ID.
  if (
    typeof workspaceId !== "string" ||
    !mongoose.isValidObjectId(workspaceId)
  ) {
    throw new FacebookOAuthSessionError("A valid workspace is required.", 400);
  }

  // 4. Verify that the user belongs to this workspace.
  const workspace = await getUserWorkspaceById(authUser, workspaceId);

  if (!workspace) {
    throw new FacebookOAuthSessionError("Workspace access denied.", 403);
  }

  // 5. Hash the session token before querying MongoDB.
  const sessionHash = hashSessionToken(sessionToken);

  // 6. Retrieve only the required public fields.
  const session = await FacebookOAuthSession.findOne({
    sessionHash,
    supabaseUserId: authUser.id,
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    expiresAt: {
      $gt: new Date(),
    },
  })
    .select("expiresAt pages.facebookPageId pages.pageName pages.tasks")
    .lean();

  if (!session) {
    throw new FacebookOAuthSessionError(
      "Facebook OAuth session is invalid or expired.",
      404,
    );
  }

  // 7. Return safe Page metadata.
  return {
    expiresAt: session.expiresAt,

    pages: session.pages.map((page: FacebookOAuthSessionPageSummary) => ({
      facebookPageId: page.facebookPageId,
      pageName: page.pageName,
      tasks: [...page.tasks],
    })),
  };
}

export async function consumeFacebookOAuthSession({
  sessionToken,
  authUser,
  workspaceId,
}: ConsumeFacebookOAuthSessionInput): Promise<ConsumedFacebookOAuthSession> {
  // 1. Validate the session token.
  if (
    typeof sessionToken !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(sessionToken)
  ) {
    throw new FacebookOAuthSessionError("Invalid Facebook OAuth session.", 400);
  }

  // 2. Validate authentication.
  if (!authUser || typeof authUser.id !== "string" || !authUser.id.trim()) {
    throw new FacebookOAuthSessionError("Authentication is required.", 401);
  }

  // 3. Validate the workspace ID.
  if (
    typeof workspaceId !== "string" ||
    !mongoose.isValidObjectId(workspaceId)
  ) {
    throw new FacebookOAuthSessionError("A valid workspace is required.", 400);
  }

  // 4. Verify workspace access.
  const workspace = await getUserWorkspaceById(authUser, workspaceId);

  if (!workspace) {
    throw new FacebookOAuthSessionError("Workspace access denied.", 403);
  }

  // 5. Hash the token.
  const sessionHash = hashSessionToken(sessionToken);

  // 6. Atomically retrieve and delete the session.
  const session = await FacebookOAuthSession.findOneAndDelete({
    sessionHash,
    supabaseUserId: authUser.id,
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    expiresAt: {
      $gt: new Date(),
    },
  })
    .select(
      "facebookUserId pages.facebookPageId pages.pageName pages.pageAccessTokenEncrypted pages.tasks",
    )
    .lean();

  if (!session) {
    throw new FacebookOAuthSessionError(
      "Facebook OAuth session is invalid, expired, or already used.",
      404,
    );
  }

  // 7. Decrypt Page tokens for backend use.
  let pages: ConsumedFacebookOAuthSessionPage[];

  try {
    pages = session.pages.map(
      (page: {
        facebookPageId: string;
        pageName: string;
        pageAccessTokenEncrypted: string;
        tasks: string[];
      }) => ({
        facebookPageId: page.facebookPageId,
        pageName: page.pageName,
        pageAccessToken: decryptFacebookToken(page.pageAccessTokenEncrypted),
        tasks: [...page.tasks],
      }),
    );
  } catch (error) {
    if (error instanceof FacebookTokenEncryptionError) {
      throw new FacebookOAuthSessionError(
        "Facebook Page credentials could not be decrypted.",
        503,
      );
    }

    throw error;
  }

  return {
    facebookUserId: session.facebookUserId,
    pages,
  };
}
