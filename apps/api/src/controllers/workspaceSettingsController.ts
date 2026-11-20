import type { RequestHandler } from "express";
import { z } from "zod";
import { workspaceSettingsPatchSchema } from "../schemas/workspaceSettingsSchema.js";
import { changeWorkspaceLifecycle, ownedSettingsWorkspace, saveWorkspaceSettings, WorkspaceSettingsError } from "../services/workspaceSettingsService.js";

const lifecycleSchema = z.object({ action: z.enum(["archive", "restore", "delete"]), confirmation: z.string() }).strict();

export const workspaceSettings: RequestHandler = async (req, res, next) => {
  try {
    const id = req.params.workspaceId;
    if (typeof id !== "string") return void res.status(404).json({ error: "Workspace not found." });
    if (req.method === "GET") return void res.json({ workspace: await ownedSettingsWorkspace(res.locals.authUser, id) });
    const parsed = workspaceSettingsPatchSchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0]?.message });
    res.json({ workspace: await saveWorkspaceSettings(res.locals.authUser, id, parsed.data) });
  } catch (error) {
    if (error instanceof WorkspaceSettingsError) res.status(error.statusCode).json({ error: error.message });
    else next(error);
  }
};

export const workspaceLifecycle: RequestHandler = async (req, res, next) => {
  try {
    const id = req.params.workspaceId;
    if (typeof id !== "string") return void res.status(404).json({ error: "Workspace not found." });
    const parsed = lifecycleSchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid workspace action." });
    const workspace = await changeWorkspaceLifecycle(res.locals.authUser, id, parsed.data.action, parsed.data.confirmation);
    res.json({ workspace: parsed.data.action === "delete" ? null : workspace });
  } catch (error) {
    if (error instanceof WorkspaceSettingsError) res.status(error.statusCode).json({ error: error.message });
    else next(error);
  }
};
