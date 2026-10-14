import type { RequestHandler } from "express";

import {
  createUserWorkspace,
  listUserWorkspaces,
} from "../services/workspaceService.js";
import { createWorkspaceSchema } from "../schemas/workspaceSchema.js";
import type { AuthenticatedUser } from "../services/userProfileService.js";

function getAuthenticatedUser(res: Parameters<RequestHandler>[1]) {
  return res.locals.authUser as AuthenticatedUser;
}

export const listWorkspaces: RequestHandler = async (_req, res, next) => {
  try {
    const authUser = getAuthenticatedUser(res);
    const workspaces = await listUserWorkspaces(authUser);

    res.status(200).json({ workspaces });
  } catch (error) {
    next(error);
  }
};

export const createWorkspace: RequestHandler = async (req, res, next) => {
  try {
    const parsed = createWorkspaceSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: "Validation failed",
        message: parsed.error.issues[0]?.message ?? "Invalid workspace data.",
      });
      return;
    }

    const authUser = getAuthenticatedUser(res);
    const workspace = await createUserWorkspace(authUser, parsed.data.name);

    res.status(201).json({ workspace });
  } catch (error) {
    next(error);
  }
};
