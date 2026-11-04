import { Router } from "express";

import { requireAuth } from "../auth/requireAuth.js";
import {
  generateCaptionController,
  generateCaptionVariationsController,
  generatePlatformCaptionsController,
  reviseCaptionController,
} from "../controllers/aiContentController.js";

const aiContentRoutes = Router();

aiContentRoutes.use(requireAuth);

aiContentRoutes.post("/generate-caption", generateCaptionController);

aiContentRoutes.post(
  "/generate-caption-variations",
  generateCaptionVariationsController,
);

aiContentRoutes.post(
  "/generate-platform-captions",
  generatePlatformCaptionsController,
);

aiContentRoutes.post("/revise-caption", reviseCaptionController);

export default aiContentRoutes;
