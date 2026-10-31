import Post from "../../models/Post.js";

import type { AuthenticatedUser } from "../userProfileService.js";

import {
  getUserWorkspaceById,
  isValidWorkspaceId,
} from "../workspaceService.js";

export class PublishingAuthorizationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "PublishingAuthorizationError";
  }
}

export type AuthorizePublishingInput = {
  authUser: AuthenticatedUser;
  workspaceId: string;
  postId: string;
};

export async function authorizePublishing({
  authUser,
  workspaceId,
  postId,
}: AuthorizePublishingInput): Promise<void> {
  // 1. Verify authentication.
  if (!authUser || typeof authUser.id !== "string" || !authUser.id.trim()) {
    throw new PublishingAuthorizationError("Authentication is required.", 401);
  }

  // 2. Validate identifiers.
  if (!isValidWorkspaceId(workspaceId) || !isValidWorkspaceId(postId)) {
    throw new PublishingAuthorizationError("Post or workspace not found.", 404);
  }

  // 3. Verify workspace access.
  const workspace = await getUserWorkspaceById(authUser, workspaceId);

  if (!workspace) {
    throw new PublishingAuthorizationError("Workspace not found.", 404);
  }

  // 4. Load the post from the authorized workspace.
  const post = await Post.findOne({
    _id: postId,
    workspaceId: workspace._id,
  })
    .select("_id workspaceId platforms")
    .lean();

  if (!post) {
    throw new PublishingAuthorizationError(
      "Post not found in this workspace.",
      404,
    );
  }

  // 5. Immediate publishing supports exactly one platform.
  if (!Array.isArray(post.platforms) || post.platforms.length !== 1) {
    throw new PublishingAuthorizationError(
      "Immediate publishing requires exactly one platform.",
      409,
    );
  }

  // 6. Allow Facebook and LinkedIn only.
  const platform = post.platforms[0];

  if (platform !== "facebook" && platform !== "linkedin") {
    throw new PublishingAuthorizationError(
      "Immediate publishing supports Facebook and LinkedIn only.",
      409,
    );
  }
}
