import { Router } from "express";

import { requireAuth } from "../auth/requireAuth.js";
import {
  linkedInOAuthCallback,
  startLinkedInConnect,
} from "../controllers/linkedinController.js";

const router = Router();

// Start OAuth: requires an authenticated Storm user.
router.post("/connect", requireAuth, startLinkedInConnect);

// LinkedIn redirects here after authorization.
// This route must remain public because the provider doesn't send
// the user's Supabase bearer token with its redirect.
router.get("/callback", linkedInOAuthCallback);

export default router;
