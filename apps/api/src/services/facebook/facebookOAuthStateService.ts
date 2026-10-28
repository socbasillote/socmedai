import { createHash, randomBytes } from "node:crypto";
import mongoose from "mongoose";

import FacebookOAuthState from "../../models/FacebookOAuthState.js";

const STATE_TTL_MS = 10 * 60 * 1000;

type CreateOAuthStateInput = {
  supabaseUserId: string;
  workspaceId: string;
};

type ConsumeOAuthStateInput = {
  state: string;
};

export class FacebookOAuthStateError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "FacebookOAuthStateError";
  }
}

function hashState(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

export async function createFacebookOAuthState({
  supabaseUserId,
  workspaceId,
}: CreateOAuthStateInput): Promise<string> {
  if (typeof supabaseUserId !== "string" || !supabaseUserId.trim()) {
    throw new FacebookOAuthStateError("Invalid authenticated user.", 401);
  }

  if (!mongoose.isValidObjectId(workspaceId)) {
    throw new FacebookOAuthStateError("Workspace not found.", 404);
  }

  const state = randomBytes(32).toString("base64url");

  await FacebookOAuthState.create({
    stateHash: hashState(state),
    supabaseUserId,
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    expiresAt: new Date(Date.now() + STATE_TTL_MS),
  });

  return state;
}

export async function consumeFacebookOAuthState({
  state,
}: ConsumeOAuthStateInput): Promise<{
  supabaseUserId: string;
  workspaceId: string;
}> {
  if (typeof state !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(state)) {
    throw new FacebookOAuthStateError(
      "Invalid or expired Facebook authorization state.",
      400,
    );
  }

  const consumedState = await FacebookOAuthState.findOneAndDelete({
    stateHash: hashState(state),
    expiresAt: { $gt: new Date() },
  });

  if (!consumedState) {
    throw new FacebookOAuthStateError(
      "Invalid or expired Facebook authorization state.",
      400,
    );
  }

  return {
    supabaseUserId: consumedState.supabaseUserId,
    workspaceId: consumedState.workspaceId.toString(),
  };
}
