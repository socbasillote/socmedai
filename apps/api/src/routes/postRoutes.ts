import { Router } from "express";

import { requireAuth } from "../auth/requireAuth.js";
import { getPublishingCapabilities } from "../services/publishing/publishingCapabilities.js";
import {
  autosaveDraft,
  createPost,
  changePostSchedule,
  reconcilePublication,
  listPostsByWorkspace,
  listCalendarPostsByWorkspace,
  getPostById,
  deleteDraftPost,
  updateDraftPost,
  publishPostNow,
} from "../controllers/postController.js";
const postRoutes = Router();

postRoutes.use(requireAuth);
postRoutes.get("/capabilities", (_req, res) => {
  res.set("Cache-Control", "no-store").json({ capabilities: getPublishingCapabilities() });
});

postRoutes.post("/", createPost);
postRoutes.put("/autosave", autosaveDraft);

postRoutes.get("/workspaces/:workspaceId", listPostsByWorkspace);

// New read-only Content Planner endpoint.
postRoutes.get(
  "/workspaces/:workspaceId/calendar",
  listCalendarPostsByWorkspace,
);

postRoutes.post("/:postId/publish", publishPostNow);
postRoutes.post("/:postId/reconcile", reconcilePublication);
postRoutes.patch("/:postId/schedule", changePostSchedule);
postRoutes.delete("/:postId/schedule", changePostSchedule);

postRoutes.get("/:postId", getPostById);

postRoutes.delete("/:postId", deleteDraftPost);

postRoutes.patch("/:postId", updateDraftPost);

export default postRoutes;
