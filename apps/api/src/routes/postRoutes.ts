import { Router } from "express";

import { requireAuth } from "../auth/requireAuth.js";
import {
  createPost,
  listPostsByWorkspace,
  getPostById,
  deleteDraftPost,
  updateDraftPost,
  publishPostNow,
} from "../controllers/postController.js";

const postRoutes = Router();

postRoutes.use(requireAuth);

postRoutes.post("/", createPost);

postRoutes.get("/workspaces/:workspaceId", listPostsByWorkspace);

postRoutes.post("/:postId/publish", publishPostNow);

postRoutes.get("/:postId", getPostById);

postRoutes.delete("/:postId", deleteDraftPost);

postRoutes.patch("/:postId", updateDraftPost);

export default postRoutes;
