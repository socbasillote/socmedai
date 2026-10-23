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
  if (!authUser.id.trim()) {
    throw new PublishingAuthorizationError("Authentication is required.", 401);
  }

  if (!isValidWorkspaceId(workspaceId) || !isValidWorkspaceId(postId)) {
    throw new PublishingAuthorizationError("Post or workspace not found.", 404);
  }

  const workspace = await getUserWorkspaceById(authUser, workspaceId);

  if (!workspace) {
    throw new PublishingAuthorizationError("Workspace not found.", 404);
  }

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

  if (!post.platforms.includes("linkedin")) {
    throw new PublishingAuthorizationError(
      "This post is not configured for LinkedIn publishing.",
      409,
    );
  }
}
