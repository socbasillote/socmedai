import mongoose from "mongoose";

import Post from "../models/Post.js";
import UserProfile from "../models/UserProfile.js";
import Workspace from "../models/Workspace.js";
import type { AuthenticatedUser } from "./userProfileService.js";
import type {
  CreatePostInput,
  UpdateDraftPostInput,
} from "../schemas/postSchema.js";
import {
  validateLinkedInConnectionSelection,
  LinkedInConnectionSelectionError,
} from "./linkedin/linkedinConnectionSelectionService.js";

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

async function validatePostLinkedInSelection(
  workspaceId: string,
  platforms: readonly string[],
  connectionId?: string,
): Promise<string | undefined> {
  if (!connectionId) {
    return undefined;
  }

  if (!platforms.includes("linkedin")) {
    throw new PostServiceError(
      "A LinkedIn account can only be selected when LinkedIn is a publishing platform.",
      400,
    );
  }

  try {
    return await validateLinkedInConnectionSelection({
      workspaceId,
      connectionId,
    });
  } catch (error) {
    if (error instanceof LinkedInConnectionSelectionError) {
      throw new PostServiceError(error.message, error.statusCode);
    }

    throw error;
  }
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

  const linkedinConnectionId = await validatePostLinkedInSelection(
    String(authorization.workspace._id),
    input.platforms,
    input.platformConnections?.linkedin,
  );

  const post = await Post.create({
    workspaceId: authorization.workspace._id,
    createdByUserId: authorization.profile._id,

    ...(input.title !== undefined ? { title: input.title } : {}),

    caption: input.caption,
    mediaIds: [],
    platforms: input.platforms,

    ...(linkedinConnectionId
      ? {
          platformConnections: {
            linkedin: linkedinConnectionId,
          },
        }
      : {}),

    status: input.scheduledAt ? "scheduled" : "draft",

    ...(input.scheduledAt ? { scheduledAt: new Date(input.scheduledAt) } : {}),
  });

  return post.toObject();
}

export async function listWorkspacePosts(
  authUser: AuthenticatedUser,
  workspaceId: string,
  pagination?: {
    limit: number;
    cursor?: string;
    search?: string;
    status?:
      | "all"
      | "draft"
      | "scheduled"
      | "publishing"
      | "published"
      | "failed";
    platform?: "all" | "facebook" | "instagram" | "linkedin";
  },
) {
  const authorization = await getAuthorizedWorkspace(authUser, workspaceId);

  if (!authorization) {
    throw new PostServiceError("Workspace not found.", 404);
  }

  const fields =
    "_id workspaceId createdByUserId title caption mediaIds platforms status scheduledAt publishedAt createdAt updatedAt";

  const workspaceFilter = {
    workspaceId: authorization.workspace._id,
  };

  // Preserve the existing full-list behavior for callers without pagination.
  if (!pagination) {
    return Post.find(workspaceFilter)
      .select(fields)
      .sort({ updatedAt: -1, _id: -1 })
      .lean();
  }

  const filter: Record<string, unknown> = {
    ...workspaceFilter,
  };

  if (pagination.status && pagination.status !== "all") {
    filter.status = pagination.status;
  }

  if (pagination.platform && pagination.platform !== "all") {
    filter.platforms = pagination.platform;
  }

  const search = pagination.search?.trim();

  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const searchRegex = new RegExp(escapedSearch, "i");

    filter.$and = [
      {
        $or: [
          { title: searchRegex },
          { caption: searchRegex },
          { platforms: searchRegex },
          { status: searchRegex },
        ],
      },
    ];
  }

  const draftCountPromise = Post.countDocuments({
    ...workspaceFilter,
    status: "draft",
  });

  if (pagination.cursor) {
    const cursorPost = await Post.findOne({
      _id: pagination.cursor,
      ...workspaceFilter,
    })
      .select("_id updatedAt")
      .lean();

    if (!cursorPost) {
      throw new PostServiceError("Invalid post cursor.", 400);
    }

    filter.$and = [
      ...(Array.isArray(filter.$and) ? filter.$and : []),
      {
        $or: [
          { updatedAt: { $lt: cursorPost.updatedAt } },
          {
            updatedAt: cursorPost.updatedAt,
            _id: { $lt: cursorPost._id },
          },
        ],
      },
    ];
  }

  const [results, draftCount] = await Promise.all([
    Post.find(filter)
      .select(fields)
      .sort({ updatedAt: -1, _id: -1 })
      .limit(pagination.limit + 1)
      .lean(),
    draftCountPromise,
  ]);

  const hasMore = results.length > pagination.limit;
  const posts = hasMore ? results.slice(0, pagination.limit) : results;
  const lastPost = posts[posts.length - 1];

  return {
    posts,
    nextCursor: hasMore && lastPost ? String(lastPost._id) : null,
    hasMore,
    draftCount,
  };
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

  const deletion = await Post.deleteOne({
    _id: post._id,
    workspaceId: workspace._id,
    createdByUserId: profile._id,
    status: "draft",
  });

  if (deletion.deletedCount !== 1) {
    throw new PostServiceError(
      "The draft could not be deleted because its status changed or it no longer exists.",
      409,
    );
  }

  return { id: postId };
}

export async function updateWorkspaceDraft(
  authUser: AuthenticatedUser,
  postId: string,
  input: UpdateDraftPostInput,
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
  }).select("_id workspaceId status platforms platformConnections __v");

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
    throw new PostServiceError("Only draft posts can be edited.", 409);
  }

  if (!Number.isSafeInteger(post.__v) || post.__v < 0) {
    throw new PostServiceError(
      "The draft version is unavailable. Refresh the post and try again.",
      409,
    );
  }

  const finalPlatforms = input.platforms ?? post.platforms;

  const linkedinIsSelected = finalPlatforms.includes("linkedin");

  const requestedLinkedInConnection = input.platformConnections?.linkedin;

  if (requestedLinkedInConnection && !linkedinIsSelected) {
    throw new PostServiceError(
      "A LinkedIn account can only be selected when LinkedIn is a publishing platform.",
      400,
    );
  }

  let validatedLinkedInConnection: string | undefined;

  if (requestedLinkedInConnection) {
    validatedLinkedInConnection = await validatePostLinkedInSelection(
      String(workspace._id),
      finalPlatforms,
      requestedLinkedInConnection,
    );
  }

  const update: {
    title?: string;
    caption?: string;
    platforms?: UpdateDraftPostInput["platforms"];
    "platformConnections.linkedin"?: string;
  } = {};

  const unset: Record<string, ""> = {};

  if (input.title !== undefined) {
    update.title = input.title;
  }

  if (input.caption !== undefined) {
    update.caption = input.caption;
  }

  if (input.platforms !== undefined) {
    update.platforms = input.platforms;
  }

  if (!linkedinIsSelected) {
    unset["platformConnections.linkedin"] = "";
  } else if (validatedLinkedInConnection) {
    update["platformConnections.linkedin"] = validatedLinkedInConnection;
  }

  const mongoUpdate: {
    $set: typeof update;
    $unset?: Record<string, "">;
    $inc: {
      __v: number;
    };
  } = {
    $set: update,
    $inc: {
      __v: 1,
    },
  };

  if (Object.keys(unset).length > 0) {
    mongoUpdate.$unset = unset;
  }

  const updatedPost = await Post.findOneAndUpdate(
    {
      _id: post._id,
      workspaceId: workspace._id,
      createdByUserId: profile._id,
      status: "draft",
      __v: post.__v,
    },
    mongoUpdate,
    {
      new: true,
      runValidators: true,
    },
  )
    .select(
      "_id workspaceId createdByUserId title caption mediaIds platforms platformConnections status scheduledAt publishedAt createdAt updatedAt __v",
    )
    .lean();

  if (!updatedPost) {
    throw new PostServiceError(
      "The draft could not be updated because its status changed or it no longer exists.",
      409,
    );
  }

  return updatedPost;
}
