import { Router } from "express";

import { requireAuth } from "../auth/requireAuth.js";
import {
  createWorkspace,
  listWorkspaces,
} from "../controllers/workspaceController.js";

const workspaceRoutes = Router();

workspaceRoutes.use(requireAuth);

workspaceRoutes.get("/", listWorkspaces);
workspaceRoutes.post("/", createWorkspace);

export default workspaceRoutes;
