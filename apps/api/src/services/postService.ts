import mongoose from "mongoose";

import Post from "../models/Post.js";
import UserProfile from "../models/UserProfile.js";
import Workspace from "../models/Workspace.js";
import type { AuthenticatedUser } from "./userProfileService.js";
import type { CreatePostInput } from "../schemas/postSchema.js";

export class PostServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "PostServiceError";
    this.statusCode = statusCode;
  }
}

async function getAuthorizedWorkspace(
  authUser: AuthenticatedUser,
  workspaceId: string,
) {
  if (!mongoose.isValidObjectId(workspaceId)) {
    return null;
  }

  const profile = await UserProfile.findOne({
    supabaseUserId: authUser.id,
  }).select("_id");

  if (!profile) {
    return null;
  }

  const workspace = await Workspace.findOne({
    _id: workspaceId,
    ownerUserId: profile._id,
  }).select("_id");

  if (!workspace) {
    return null;
  }

  return { profile, workspace };
}

export async function createWorkspacePost(
  authUser: AuthenticatedUser,
  input: CreatePostInput,
) {
  const authorization = await getAuthorizedWorkspace(
    authUser,
    input.workspaceId,
  );

  if (!authorization) {
    throw new PostServiceError("Workspace not found.", 404);
  }

  if (input.mediaIds.length > 0) {
    throw new PostServiceError("Media attachments are not available yet.", 400);
  }

  const post = await Post.create({
    workspaceId: authorization.workspace._id,
    createdByUserId: authorization.profile._id,
    ...(input.title !== undefined ? { title: input.title } : {}),
    caption: input.caption,
    mediaIds: [],
    platforms: input.platforms,
    status: input.scheduledAt ? "scheduled" : "draft",
    ...(input.scheduledAt ? { scheduledAt: new Date(input.scheduledAt) } : {}),
  });

  return post.toObject();
}

export async function listWorkspacePosts(
  authUser: AuthenticatedUser,
  workspaceId: string,
) {
  const authorization = await getAuthorizedWorkspace(authUser, workspaceId);

  if (!authorization) {
    throw new PostServiceError("Workspace not found.", 404);
  }

  return Post.find({
    workspaceId: authorization.workspace._id,
  })
    .select(
      "_id workspaceId createdByUserId title caption mediaIds platforms status scheduledAt publishedAt createdAt updatedAt",
    )
    .sort({ updatedAt: -1 })
    .lean();
}

export async function deleteWorkspaceDraft(
  authUser: AuthenticatedUser,
  postId: string,
) {
  if (!mongoose.isValidObjectId(postId)) {
    throw new PostServiceError("Post not found.", 404);
  }

  const profile = await UserProfile.findOne({
    supabaseUserId: authUser.id,
  }).select("_id");

  if (!profile) {
    throw new PostServiceError("Post not found.", 404);
  }

  const post = await Post.findOne({
    _id: postId,
    createdByUserId: profile._id,
  }).select("_id workspaceId status");

  if (!post) {
    throw new PostServiceError("Post not found.", 404);
  }

  const workspace = await Workspace.findOne({
    _id: post.workspaceId,
    ownerUserId: profile._id,
  }).select("_id");

  if (!workspace) {
    throw new PostServiceError("Post not found.", 404);
  }

  if (post.status !== "draft") {
    throw new PostServiceError("Only draft posts can be deleted.", 409);
  }

  await Post.deleteOne({
    _id: post._id,
    workspaceId: workspace._id,
    createdByUserId: profile._id,
    status: "draft",
  });

  return { id: postId };
}
