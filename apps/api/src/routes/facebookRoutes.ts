import { Router } from "express";

import { requireAuth } from "../auth/requireAuth.js";

import {
  startFacebookConnect,
  facebookOAuthCallback,
  getFacebookOAuthSessionController,
  connectFacebookPagesController,
  getFacebookConnectionsController,
} from "../controllers/facebookController.js";

const router = Router();

/**
 * Start Facebook OAuth.
 *
 * Requires an authenticated Storm user.
 */
router.post("/connect", requireAuth, startFacebookConnect);

/**
 * Facebook OAuth callback.
 *
 * Public endpoint.
 * Authentication is established through the
 * single-use OAuth state parameter.
 */
router.get("/callback", facebookOAuthCallback);

/**
 * Retrieve temporary Facebook OAuth session details.
 *
 * Requires:
 * - Supabase authentication
 * - Workspace ownership
 * - Temporary OAuth session cookie
 */
router.get("/oauth/session", requireAuth, getFacebookOAuthSessionController);

/**
 * Connect selected Facebook Pages to a Storm workspace.
 *
 * Requires:
 * - Supabase authentication
 * - Valid request Origin
 * - Workspace ownership
 * - Temporary OAuth session cookie
 * - CREATE_CONTENT permission for selected Pages
 */
router.post("/pages/connect", requireAuth, connectFacebookPagesController);

/**
 * List Facebook Pages connected to a workspace.
 *
 * Authentication is required.
 * Workspace access is verified by the controller's service.
 */
router.get("/connections", requireAuth, getFacebookConnectionsController);

export default router;
