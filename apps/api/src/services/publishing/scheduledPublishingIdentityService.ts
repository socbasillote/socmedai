import mongoose from "mongoose";

import UserProfile from "../../models/UserProfile.js";

import type { AuthenticatedUser } from "../userProfileService.js";

export class ScheduledPublishingIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScheduledPublishingIdentityError";
  }
}

/**
 * Resolves the original post creator for a trusted
 * server-side scheduled publishing operation.
 *
 * This does not create an authentication session.
 * It must never be exposed as an HTTP endpoint.
 */
export async function resolveScheduledPublishingIdentity(
  createdByUserId: string,
): Promise<AuthenticatedUser> {
  if (
    typeof createdByUserId !== "string" ||
    !mongoose.isObjectIdOrHexString(createdByUserId)
  ) {
    throw new ScheduledPublishingIdentityError(
      "A valid post creator ID is required.",
    );
  }

  const profile = await UserProfile.findById(createdByUserId)
    .select("_id supabaseUserId email")
    .lean();

  if (!profile) {
    throw new ScheduledPublishingIdentityError(
      "The post creator profile no longer exists.",
    );
  }

  if (
    typeof profile.supabaseUserId !== "string" ||
    !profile.supabaseUserId.trim()
  ) {
    throw new ScheduledPublishingIdentityError(
      "The post creator has no valid Supabase identity.",
    );
  }

  return {
    id: profile.supabaseUserId,
    email:
      typeof profile.email === "string" && profile.email.trim()
        ? profile.email
        : null,
  };
}
