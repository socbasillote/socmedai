import type { RequestHandler } from "express";

import type { AuthenticatedUser } from "../services/userProfileService.js";

import {
  listAuthorizedMediaLibrary,
  MediaLibraryError,
  getAuthorizedMediaLibraryItem,
  type MediaLibraryScope,
} from "../services/media/mediaLibraryService.js";

export const getMediaLibraryController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const allowedKeys = ["workspaceId", "scope", "limit"];

    if (Object.keys(req.query).some((key) => !allowedKeys.includes(key))) {
      res.status(400).json({
        error: "Invalid media library query.",
      });
      return;
    }

    const workspaceId = req.query.workspaceId;
    const scope = req.query.scope ?? "current";
    const limit = req.query.limit;

    if (
      typeof workspaceId !== "string" ||
      (scope !== "current" && scope !== "all") ||
      (limit !== undefined &&
        (typeof limit !== "string" || !/^[1-9][0-9]*$/.test(limit)))
    ) {
      res.status(400).json({
        error: "Invalid media library query.",
      });
      return;
    }

    const result = await listAuthorizedMediaLibrary({
      authUser: res.locals.authUser as AuthenticatedUser,
      workspaceId,
      scope: scope as MediaLibraryScope,
      limit: limit === undefined ? undefined : Number(limit),
    });

    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Referrer-Policy", "no-referrer");

    res.status(200).json(result);
  } catch (error) {
    if (error instanceof MediaLibraryError) {
      res.status(error.statusCode).json({
        error: error.message,
      });
      return;
    }

    next(error);
  }
};

export const getMediaLibraryItemController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const assetId = req.params.assetId;

    if (typeof assetId !== "string") {
      res.status(404).json({
        error: "Media asset not found.",
      });
      return;
    }

    const item = await getAuthorizedMediaLibraryItem(
      res.locals.authUser as AuthenticatedUser,
      assetId,
    );

    res.setHeader("Cache-Control", "private, no-store");

    res.setHeader("Referrer-Policy", "no-referrer");

    res.status(200).json({
      image: item,
    });
  } catch (error) {
    if (error instanceof MediaLibraryError) {
      res.status(error.statusCode).json({
        error: error.message,
      });
      return;
    }

    next(error);
  }
};
