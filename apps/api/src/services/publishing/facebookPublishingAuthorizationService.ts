import Post from "../../models/Post.js";

import type { AuthenticatedUser } from "../userProfileService.js";

import {
  getUserWorkspaceById,
  isValidWorkspaceId,
} from "../workspaceService.js";

/**
 * Facebook-specific publishing authorization error.
 *
 * This service is independent of LinkedIn's
 * PublishingAuthorizationError.
 */
export class FacebookPublishingAuthorizationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);

    this.name = "FacebookPublishingAuthorizationError";
  }
}

export type AuthorizeFacebookPublishingInput = {
  authUser: AuthenticatedUser;
  workspaceId: string;
  postId: string;
};

/**
 * Authorizes publication of an already-claimed
 * Facebook-only post.
 *
 * Validates:
 * - Authenticated user
 * - Workspace and post identifiers
 * - Workspace ownership
 * - Post belongs to the authorized workspace
 * - Facebook-only platform selection
 * - Selected Facebook Page connection
 * - Claimed publishing state
 * - Text-only content
 *
 * This function does not:
 * - Retrieve Facebook tokens
 * - Invoke Facebook Graph API
 * - Claim or update a post
 * - Publish content
 */
export async function authorizeFacebookPublishing({
  authUser,
  workspaceId,
  postId,
}: AuthorizeFacebookPublishingInput): Promise<void> {
  // 1. Authentication.
  if (!authUser.id.trim()) {
    throw new FacebookPublishingAuthorizationError(
      "Authentication is required.",
      401,
    );
  }

  // 2. Validate identifiers before database queries.
  if (!isValidWorkspaceId(workspaceId) || !isValidWorkspaceId(postId)) {
    throw new FacebookPublishingAuthorizationError(
      "Post or workspace not found.",
      404,
    );
  }

  // 3. Verify workspace ownership.
  const workspace = await getUserWorkspaceById(authUser, workspaceId);

  if (!workspace) {
    throw new FacebookPublishingAuthorizationError("Workspace not found.", 404);
  }

  // 4. Load the persisted post from the authorized
  // workspace, never trusting client-supplied content.
  const post = await Post.findOne({
    _id: postId,
    workspaceId: workspace._id,
  })
    .select(
      "_id workspaceId platforms platformConnections " + "status mediaIds",
    )
    .lean();

  if (!post) {
    throw new FacebookPublishingAuthorizationError(
      "Post not found in this workspace.",
      404,
    );
  }

  // 5. Only Facebook-only posts can enter this
  // immediate publishing workflow.
  if (post.platforms.length !== 1 || post.platforms[0] !== "facebook") {
    throw new FacebookPublishingAuthorizationError(
      "This post is not configured for Facebook-only publishing.",
      409,
    );
  }

  // 6. Require the previously claimed publishing state.
  //
  // This prevents the Facebook adapter from being
  // authorized to publish an unclaimed draft.
  if (post.status !== "publishing") {
    throw new FacebookPublishingAuthorizationError(
      "This post has not been claimed for publishing.",
      409,
    );
  }

  // 7. Verify a Facebook Page was selected.
  const selectedPageConnection = post.platformConnections?.facebook;

  if (!selectedPageConnection) {
    throw new FacebookPublishingAuthorizationError(
      "No Facebook Page was selected for this post.",
      409,
    );
  }

  // 8. Keep media publishing disabled for now.
  if (post.mediaIds.length > 0) {
    throw new FacebookPublishingAuthorizationError(
      "Facebook media publishing is not supported yet.",
      409,
    );
  }
}
