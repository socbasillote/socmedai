import mongoose from "mongoose";

/**
 * Validated request for an immediate
 * text-only Facebook Page post.
 */
export type FacebookPublishInput = {
  workspaceId: string;
  facebookConnectionId: string;
  message: string;
};

/**
 * Storm-defined limit for the initial
 * text-only publishing feature.
 *
 * This is an application policy, not
 * a claimed Meta Graph API limit.
 */
export const FACEBOOK_POST_MESSAGE_MAX_LENGTH = 5000;

export class FacebookPublishInputError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "FacebookPublishInputError";
  }
}

/**
 * Validate an untrusted Facebook publishing request.
 *
 * This function:
 * - Does not access MongoDB.
 * - Does not access Facebook.
 * - Does not publish anything.
 * - Does not authorize workspace access.
 */
export function parseFacebookPublishInput(
  input: unknown,
): FacebookPublishInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new FacebookPublishInputError(
      "A valid publishing request is required.",
    );
  }

  const data = input as Record<string, unknown>;

  // 1. Validate workspace ID.
  if (
    typeof data.workspaceId !== "string" ||
    !mongoose.isObjectIdOrHexString(data.workspaceId)
  ) {
    throw new FacebookPublishInputError("A valid workspace is required.");
  }

  // 2. Validate the saved Facebook connection ID.
  if (
    typeof data.facebookConnectionId !== "string" ||
    !mongoose.isObjectIdOrHexString(data.facebookConnectionId)
  ) {
    throw new FacebookPublishInputError(
      "A valid Facebook connection is required.",
    );
  }

  // 3. Require text content.
  if (typeof data.message !== "string") {
    throw new FacebookPublishInputError("Post content is required.");
  }

  const message = data.message.trim();

  // 4. Reject empty or whitespace-only content.
  if (!message) {
    throw new FacebookPublishInputError("Post content cannot be empty.");
  }

  // 5. Apply Storm's initial text length policy.
  if (message.length > FACEBOOK_POST_MESSAGE_MAX_LENGTH) {
    throw new FacebookPublishInputError(
      `Post content must not exceed ${FACEBOOK_POST_MESSAGE_MAX_LENGTH} characters.`,
    );
  }

  // 6. Return normalized data.
  return {
    workspaceId: data.workspaceId,
    facebookConnectionId: data.facebookConnectionId,
    message,
  };
}
