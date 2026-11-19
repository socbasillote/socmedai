import { uploadImageReference, ImageReferenceError } from "../services/media/imageReferenceService.js";
import type { AuthenticatedUser } from "../services/userProfileService.js";
import { Router, raw } from "express";

import { requireAuth } from "../auth/requireAuth.js";

import {
  generateWorkspaceImageController,
  getWorkspaceImageController,
  getWorkspaceImageCreditsController,
  getWorkspaceImageUrlController,
} from "../controllers/imageGenerationController.js";

import { getWorkspaceImageHistoryController } from "../controllers/imageGenerationHistoryController.js";

import {
  getMediaLibraryController,
  getMediaLibraryItemController,
} from "../controllers/mediaLibraryController.js";

const imageGenerationRoutes = Router();

// All three endpoints require authentication.
imageGenerationRoutes.use(requireAuth);

imageGenerationRoutes.post("/workspaces/:workspaceId/images/references",
  (req, res, next) => {
    raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "10mb" })(req, res, (error) => {
      if (error) { res.status(413).json({ error: "Choose a photo up to 10 MB." }); return; }
      next();
    });
  },
  async (req, res, next) => {
    try {
      const reference = await uploadImageReference(res.locals.authUser as AuthenticatedUser, String(req.params.workspaceId), req.body);
      res.status(201).json(reference);
    } catch (error) {
      if (error instanceof ImageReferenceError) { res.status(error.statusCode).json({ error: error.message }); return; }
      next(error);
    }
  },
);

imageGenerationRoutes.get("/media/library", getMediaLibraryController);
imageGenerationRoutes.get(
  "/media/library/:assetId",
  getMediaLibraryItemController,
);
// Register credits before the dynamic asset ID.
imageGenerationRoutes.get(
  "/workspaces/:workspaceId/images/credits",
  getWorkspaceImageCreditsController,
);

imageGenerationRoutes.get(
  "/workspaces/:workspaceId/images/history",
  requireAuth,
  getWorkspaceImageHistoryController,
);

imageGenerationRoutes.get(
  "/workspaces/:workspaceId/images/:assetId/url",
  getWorkspaceImageUrlController,
);

imageGenerationRoutes.get(
  "/workspaces/:workspaceId/images/:assetId",
  getWorkspaceImageController,
);

imageGenerationRoutes.post(
  "/workspaces/:workspaceId/images",
  generateWorkspaceImageController,
);

export default imageGenerationRoutes;
