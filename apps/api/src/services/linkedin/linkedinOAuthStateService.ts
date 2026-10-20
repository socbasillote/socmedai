import { createHash, randomBytes } from "node:crypto";
import mongoose from "mongoose";

import LinkedInOAuthState from "../../models/LinkedInOAuthState.js";

const STATE_TTL_MS = 10 * 60 * 1000;

type CreateOAuthStateInput = {
  supabaseUserId: string;
  workspaceId: string;
};

type ConsumeOAuthStateInput = {
  state: string;
};

export class LinkedInOAuthStateError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "LinkedInOAuthStateError";
  }
}

function hashState(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

export async function createLinkedInOAuthState({
  supabaseUserId,
  workspaceId,
}: CreateOAuthStateInput): Promise<string> {
  if (!supabaseUserId.trim()) {
    throw new LinkedInOAuthStateError("Invalid authenticated user.", 401);
  }

  if (!mongoose.isValidObjectId(workspaceId)) {
    throw new LinkedInOAuthStateError("Workspace not found.", 404);
  }

  const state = randomBytes(32).toString("base64url");

  await LinkedInOAuthState.create({
    stateHash: hashState(state),
    supabaseUserId,
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    expiresAt: new Date(Date.now() + STATE_TTL_MS),
  });

  return state;
}

export async function consumeLinkedInOAuthState({
  state,
}: ConsumeOAuthStateInput): Promise<{
  supabaseUserId: string;
  workspaceId: string;
}> {
  if (typeof state !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(state)) {
    throw new LinkedInOAuthStateError(
      "Invalid or expired LinkedIn authorization state.",
      400,
    );
  }

  const consumedState = await LinkedInOAuthState.findOneAndDelete({
    stateHash: createHash("sha256").update(state).digest("hex"),
    expiresAt: { $gt: new Date() },
  });

  if (!consumedState) {
    throw new LinkedInOAuthStateError(
      "Invalid or expired LinkedIn authorization state.",
      400,
    );
  }

  return {
    supabaseUserId: consumedState.supabaseUserId,
    workspaceId: consumedState.workspaceId.toString(),
  };
}
