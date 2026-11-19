import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/requireAuth.js";
import { connectInstagramAccount, listInstagramConnections, InstagramConnectionError } from "../services/instagram/instagramConnectionService.js";
import { FacebookPublishingCredentialsError } from "../services/facebook/facebookPublishingTokenService.js";
const router = Router();
router.use(requireAuth);
router.get("/connections", async (req, res, next) => {
  try {
    if (typeof req.query.workspaceId !== "string") { res.status(400).json({ error: "A workspace is required." }); return; }
    res.json({ connections: await listInstagramConnections(res.locals.authUser, req.query.workspaceId) });
  } catch (error) {
    if (error instanceof InstagramConnectionError) { res.status(error.statusCode).json({ error: error.message }); return; }
    next(error);
  }
});
router.post("/connections", async (req, res, next) => {
  try {
    const parsed = z.object({ workspaceId: z.string().regex(/^[a-f0-9]{24}$/i), facebookConnectionId: z.string().regex(/^[a-f0-9]{24}$/i) }).strict().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Select a workspace and a connected Facebook Page." }); return; }
    res.json({ connections: await connectInstagramAccount(res.locals.authUser, parsed.data.workspaceId, parsed.data.facebookConnectionId) });
  } catch (error) {
    if (error instanceof InstagramConnectionError || error instanceof FacebookPublishingCredentialsError) { res.status(error.statusCode).json({ error: error.message }); return; }
    next(error);
  }
});
export default router;
