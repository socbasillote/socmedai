import { Router } from "express";

import { requireAuth } from "../auth/requireAuth.js";
import {
  createWorkspace,
  getWorkspaceById,
  listWorkspaces,
} from "../controllers/workspaceController.js";

const workspaceRoutes = Router();

workspaceRoutes.use(requireAuth);

workspaceRoutes.get("/", listWorkspaces);
workspaceRoutes.post("/", createWorkspace);
workspaceRoutes.get("/:workspaceId", getWorkspaceById);

export default workspaceRoutes;
