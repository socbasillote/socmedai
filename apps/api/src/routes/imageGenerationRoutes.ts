import { Router } from "express";

import { requireAuth } from "../auth/requireAuth.js";

import {
  generateWorkspaceImageController,
  getWorkspaceImageController,
  getWorkspaceImageCreditsController,
  getWorkspaceImageUrlController,
} from "../controllers/imageGenerationController.js";

import { getWorkspaceImageHistoryController } from "../controllers/imageGenerationHistoryController.js";

const imageGenerationRoutes = Router();

// All three endpoints require authentication.
imageGenerationRoutes.use(requireAuth);

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
