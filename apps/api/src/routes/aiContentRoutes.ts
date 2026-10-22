import { Router } from "express";

import { requireAuth } from "../auth/requireAuth.js";
import {
  generateCaptionController,
  reviseCaptionController,
} from "../controllers/aiContentController.js";

const aiContentRoutes = Router();

aiContentRoutes.use(requireAuth);

aiContentRoutes.post("/generate-caption", generateCaptionController);
aiContentRoutes.post("/revise-caption", reviseCaptionController);

export default aiContentRoutes;
