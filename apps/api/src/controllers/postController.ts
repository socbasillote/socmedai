import type { RequestHandler } from "express";

import { createPostSchema } from "../schemas/postSchema.js";
import type { AuthenticatedUser } from "../services/userProfileService.js";
import {
  createWorkspacePost,
  listWorkspacePosts,
  PostServiceError,
} from "../services/postService.js";

function getAuthenticatedUser(
  res: Parameters<RequestHandler>[1],
): AuthenticatedUser {
  return res.locals.authUser as AuthenticatedUser;
}

export const createPost: RequestHandler = async (req, res, next) => {
  try {
    const parsed = createPostSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: "Validation failed",
        message: parsed.error.issues[0]?.message ?? "Invalid post data.",
      });
      return;
    }

    const authUser = getAuthenticatedUser(res);
    const post = await createWorkspacePost(authUser, parsed.data);

    res.status(201).json({ post });
  } catch (error) {
    if (error instanceof PostServiceError) {
      res.status(error.statusCode).json({
        error:
          error.statusCode === 404
            ? "Workspace not found"
            : "Post creation failed",
        message: error.message,
      });
      return;
    }

    next(error);
  }
};

export const listPostsByWorkspace: RequestHandler = async (req, res, next) => {
  try {
    const workspaceId = req.params.workspaceId;

    if (typeof workspaceId !== "string") {
      res.status(404).json({ error: "Workspace not found" });
      return;
    }

    const authUser = getAuthenticatedUser(res);
    const posts = await listWorkspacePosts(authUser, workspaceId);

    res.status(200).json({ posts });
  } catch (error) {
    if (error instanceof PostServiceError) {
      res.status(error.statusCode).json({
        error: "Workspace not found",
      });
      return;
    }

    next(error);
  }
};
