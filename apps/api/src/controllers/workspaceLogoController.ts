import type { RequestHandler } from "express";

import type { AuthenticatedUser } from "../services/userProfileService.js";

import {
  getWorkspaceLogoSettings,
  WorkspaceLogoServiceError,
} from "../services/workspaceLogoService.js";

import { uploadUserWorkspaceLogo } from "../services/workspaceLogoService.js";

import { WorkspaceLogoStorageError } from "../services/media/workspaceLogoStorage.js";

import { updateUserWorkspaceLogoSettings } from "../services/workspaceLogoService.js";

import { updateWorkspaceLogoSchema } from "../schemas/workspaceLogoUpdateSchema.js";

export const getWorkspaceLogo: RequestHandler = async (req, res, next) => {
  try {
    const workspaceId = req.params.workspaceId;

    if (typeof workspaceId !== "string") {
      res.status(404).json({
        error: "Workspace not found.",
      });
      return;
    }

    const authUser = res.locals.authUser as AuthenticatedUser;

    const logoOverlay = await getWorkspaceLogoSettings(authUser, workspaceId);

    res.status(200).json({
      logoOverlay,
    });
  } catch (error) {
    if (error instanceof WorkspaceLogoServiceError) {
      res.status(error.statusCode).json({
        error: error.message,
      });
      return;
    }

    next(error);
  }
};

export const uploadWorkspaceLogo: RequestHandler = async (req, res, next) => {
  try {
    const workspaceId = req.params.workspaceId;

    if (typeof workspaceId !== "string") {
      res.status(404).json({
        error: "Workspace not found.",
      });
      return;
    }

    // This route uses express.raw(), not JSON
    // or multipart/form-data.
    const contentType = req.headers["content-type"]
      ?.split(";")[0]
      ?.trim()
      .toLowerCase();

    const acceptedTypes = ["image/png", "image/jpeg", "image/webp"];

    if (!contentType || !acceptedTypes.includes(contentType)) {
      res.status(415).json({
        error: "Unsupported logo file type.",
      });
      return;
    }

    if (!Buffer.isBuffer(req.body)) {
      res.status(400).json({
        error: "Logo image bytes are required.",
      });
      return;
    }

    const logoOverlay = await uploadUserWorkspaceLogo(
      res.locals.authUser as AuthenticatedUser,
      workspaceId,
      req.body,
    );

    res.status(201).json({
      logoOverlay,
    });
  } catch (error) {
    if (error instanceof WorkspaceLogoServiceError) {
      res.status(error.statusCode).json({
        error: error.message,
      });
      return;
    }

    if (error instanceof WorkspaceLogoStorageError) {
      res.status(400).json({
        error: error.message,
      });
      return;
    }

    next(error);
  }
};

export const updateWorkspaceLogo: RequestHandler = async (req, res, next) => {
  try {
    const workspaceId = req.params.workspaceId;

    if (typeof workspaceId !== "string") {
      res.status(404).json({
        error: "Workspace not found.",
      });
      return;
    }

    const parsed = updateWorkspaceLogoSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid logo settings.",
        message: parsed.error.issues[0]?.message ?? "Validation failed.",
      });
      return;
    }

    const logoOverlay = await updateUserWorkspaceLogoSettings(
      res.locals.authUser as AuthenticatedUser,
      workspaceId,
      parsed.data,
    );

    res.status(200).json({
      logoOverlay,
    });
  } catch (error) {
    if (error instanceof WorkspaceLogoServiceError) {
      res.status(error.statusCode).json({
        error: error.message,
      });
      return;
    }

    next(error);
  }
};
