import { Router } from "express";

import { requireAuth } from "../auth/requireAuth.js";
import { generateCaptionController } from "../controllers/aiContentController.js";

const aiContentRoutes = Router();

aiContentRoutes.use(requireAuth);

aiContentRoutes.post("/generate-caption", generateCaptionController);

export default aiContentRoutes;
