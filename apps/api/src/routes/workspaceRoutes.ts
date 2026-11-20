import express, { Router } from "express";
import { workspaceSettings, workspaceLifecycle } from "../controllers/workspaceSettingsController.js";

import { requireAuth } from "../auth/requireAuth.js";
import {
  createWorkspace,
  getWorkspaceById,
  listWorkspaces,
} from "../controllers/workspaceController.js";

import {
  getWorkspaceLogo,
  getWorkspaceLogoPreview,
  uploadWorkspaceLogo,
  updateWorkspaceLogo,
} from "../controllers/workspaceLogoController.js";

const workspaceRoutes = Router();

workspaceRoutes.use(requireAuth);

workspaceRoutes.get("/", listWorkspaces);
workspaceRoutes.post("/", createWorkspace);
workspaceRoutes.get("/:workspaceId/settings", workspaceSettings);
workspaceRoutes.patch("/:workspaceId/settings", workspaceSettings);
workspaceRoutes.post("/:workspaceId/lifecycle", workspaceLifecycle);

workspaceRoutes.post(
  "/:workspaceId/logo",
  express.raw({
    type: ["image/png", "image/jpeg", "image/webp"],
    limit: "5mb",
    inflate: false,
  }),
  uploadWorkspaceLogo,
);

workspaceRoutes.patch("/:workspaceId/logo", updateWorkspaceLogo);

workspaceRoutes.get("/:workspaceId/logo", getWorkspaceLogo);

workspaceRoutes.get("/:workspaceId/logo/preview", getWorkspaceLogoPreview);

workspaceRoutes.get("/:workspaceId", getWorkspaceById);

export default workspaceRoutes;
