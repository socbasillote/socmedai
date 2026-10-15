import { Router } from "express";

import { requireAuth } from "../auth/requireAuth.js";
import {
  createPost,
  listPostsByWorkspace,
} from "../controllers/postController.js";

const postRoutes = Router();

postRoutes.use(requireAuth);

postRoutes.post("/", createPost);

postRoutes.get("/workspaces/:workspaceId", listPostsByWorkspace);

export default postRoutes;
