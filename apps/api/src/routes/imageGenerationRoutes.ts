import { Router } from "express";

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
