import sharp from "sharp";
import mongoose from "mongoose";
import Workspace from "../models/Workspace.js";
import UserProfile from "../models/UserProfile.js";
import Post from "../models/Post.js";
import MediaAsset from "../models/MediaAsset.js";
import FacebookConnection from "../models/FacebookConnection.js";
import LinkedInConnection from "../models/LinkedInConnection.js";
import type { AuthenticatedUser } from "./userProfileService.js";
import type { WorkspaceSettingsPatch } from "../schemas/workspaceSettingsSchema.js";

export class WorkspaceSettingsError extends Error {
  constructor(message: string, public statusCode: number) { super(message); }
}

export async function ownedSettingsWorkspace(user: AuthenticatedUser, id: string) {
  if (!mongoose.isObjectIdOrHexString(id)) throw new WorkspaceSettingsError("Workspace not found.", 404);
  const profile = await UserProfile.findOne({ supabaseUserId: user.id }).select("_id");
  const workspace = profile && await Workspace.findOne({ _id: id, ownerUserId: profile._id }).setOptions({ includeArchivedWorkspaces: true }).lean();
  if (!workspace) throw new WorkspaceSettingsError("Workspace not found.", 404);
  return workspace;
}

export async function saveWorkspaceSettings(user: AuthenticatedUser, id: string, input: WorkspaceSettingsPatch) {
  const workspace = await ownedSettingsWorkspace(user, id);
  if (workspace.archivedAt) throw new WorkspaceSettingsError("Restore this workspace before editing settings.", 409);
  const changes: Record<string, unknown> = {};
  if (input.name !== undefined) changes.name = input.name;
  for (const key of ["description", "timezone", "defaultLanguage", "publishing", "defaultDestinations"] as const) {
    if (input[key] !== undefined) changes[`settings.${key}`] = input[key];
  }
  if (input.avatar !== undefined) {
    if (!input.avatar) changes["settings.avatar"] = "";
    else {
      try {
        const bytes = Buffer.from(input.avatar.split(",")[1], "base64");
        if (bytes.length > 120 * 1024) throw new Error();
        const image = sharp(bytes, { limitInputPixels: 16000000, animated: false });
        const metadata = await image.metadata();
        if (!["png", "jpeg", "webp"].includes(metadata.format ?? "")) throw new Error();
        const normalized = await image.rotate().resize(128, 128, { fit: "cover" }).webp({ quality: 80 }).toBuffer();
        changes["settings.avatar"] = `data:image/webp;base64,${normalized.toString("base64")}`;
      } catch { throw new WorkspaceSettingsError("Avatar could not be read. Use a valid image under 120 KB and 16 megapixels.", 400); }
    }
  }
  const destinations = input.defaultDestinations;
  if (destinations?.facebook) {
    const page = await FacebookConnection.findOne({ _id: destinations.facebook, workspaceId: id, status: "connected", tasks: "CREATE_CONTENT" }).select("_id");
    if (!page) throw new WorkspaceSettingsError("Choose a connected Facebook Page with publishing permission in this workspace.", 400);
  }
  if (destinations?.linkedin) {
    const account = await LinkedInConnection.findOne({ _id: destinations.linkedin, workspaceId: id, status: "connected", tokenExpiresAt: { $gt: new Date() } }).select("_id");
    if (!account) throw new WorkspaceSettingsError("Choose a connected LinkedIn account in this workspace.", 400);
  }
  const updated = await Workspace.findOneAndUpdate({ _id: id, ownerUserId: workspace.ownerUserId }, { $set: changes }, { returnDocument: "after", runValidators: true }).lean();
  if (!updated) throw new WorkspaceSettingsError("Workspace changed. Reload settings and try again.", 409);
  return updated;
}

export async function changeWorkspaceLifecycle(user: AuthenticatedUser, id: string, action: "archive" | "restore" | "delete", confirmation: string) {
  const workspace = await ownedSettingsWorkspace(user, id);
  if (confirmation !== workspace.name) throw new WorkspaceSettingsError("Type the workspace name exactly to confirm.", 400);
  if (action !== "restore") {
    const [post, generation] = await Promise.all([
      Post.exists({ workspaceId: id, status: { $in: ["scheduled", "publishing"] } }),
      MediaAsset.exists({ workspaceId: id, status: "pending" }),
    ]);
    if (post || generation) throw new WorkspaceSettingsError("Cancel scheduled posts and wait for publishing and image generation to finish first.", 409);
  }
  const updated = await Workspace.findOneAndUpdate({ _id: id, ownerUserId: workspace.ownerUserId }, {
    $set: action === "delete" ? { deletedAt: new Date(), archivedAt: new Date() } : { archivedAt: action === "archive" ? new Date() : null },
  }, { returnDocument: "after", includeArchivedWorkspaces: true }).lean();
  if (!updated) throw new WorkspaceSettingsError("Workspace changed. Reload and try again.", 409);
  return updated;
}
