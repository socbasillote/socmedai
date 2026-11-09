import type { RequestHandler } from "express";

import type { AuthenticatedUser } from "../services/userProfileService.js";

import {
  ImageGenerationHistoryError,
  listWorkspaceImageHistory,
} from "../services/imageGenerationHistoryService.js";

function singleString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export const getWorkspaceImageHistoryController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const workspaceId = singleString(req.params.workspaceId);

    if (!workspaceId) {
      res.status(404).json({
        error: "Workspace not found.",
      });
      return;
    }

    const queryKeys = Object.keys(req.query);

    if (
      queryKeys.some((key) => key !== "limit" && key !== "cursor") ||
      (req.query.limit !== undefined && typeof req.query.limit !== "string") ||
      (req.query.cursor !== undefined && typeof req.query.cursor !== "string")
    ) {
      res.status(400).json({
        error: "Invalid image history query.",
      });
      return;
    }

    const limitText = singleString(req.query.limit);

    if (limitText !== undefined && !/^[1-9][0-9]*$/.test(limitText)) {
      res.status(400).json({
        error: "Invalid history page size.",
      });
      return;
    }

    const cursor = singleString(req.query.cursor);

    if (cursor === "") {
      res.status(400).json({
        error: "Invalid image history cursor.",
      });
      return;
    }

    const history = await listWorkspaceImageHistory({
      authUser: res.locals.authUser as AuthenticatedUser,
      workspaceId,
      limit: limitText === undefined ? undefined : Number(limitText),
      cursor,
    });

    res.setHeader("Cache-Control", "private, no-store");

    res.setHeader("Referrer-Policy", "no-referrer");

    res.status(200).json(history);
  } catch (error) {
    if (error instanceof ImageGenerationHistoryError) {
      res.status(error.statusCode).json({
        error: error.message,
      });
      return;
    }

    next(error);
  }
};
