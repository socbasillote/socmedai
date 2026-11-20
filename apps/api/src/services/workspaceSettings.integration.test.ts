import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import sharp from "sharp";
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest";
import request from "supertest";

vi.mock("../auth/requireAuth.js", () => ({ requireAuth: (req: { headers: Record<string, string> }, res: { locals: Record<string, unknown>; status: (code: number) => { json: (data: unknown) => void } }, next: () => void) => {
  if (!req.headers.authorization) return res.status(401).json({ error: "Unauthorized" });
  res.locals.authUser = { id: req.headers.authorization, email: null }; next();
} }));

import { app } from "../app.js";
import Workspace from "../models/Workspace.js";
import UserProfile from "../models/UserProfile.js";
import Post from "../models/Post.js";
import MediaAsset from "../models/MediaAsset.js";
import FacebookConnection from "../models/FacebookConnection.js";
import LinkedInConnection from "../models/LinkedInConnection.js";
import { getUserWorkspaceById, listUserWorkspaces } from "./workspaceService.js";
import { schedulingRuleError, workspaceSettingsPatchSchema } from "../schemas/workspaceSettingsSchema.js";
import { createWorkspacePost, changeWorkspaceSchedule } from "./postService.js";

const user = { id: "settings-owner", email: null };
const owner = new mongoose.Types.ObjectId();
const id = new mongoose.Types.ObjectId();
const otherId = new mongoose.Types.ObjectId();
const facebook = new mongoose.Types.ObjectId();
const linkedin = new mongoose.Types.ObjectId();
const preferences = { defaultPostMode: "scheduled" as const, preferredTimes: ["09:00", "17:30"], allowedWeekdays: [1, 2, 3, 4, 5], minimumNoticeMinutes: 60, maximumAdvanceDays: 30 };
let mongo: MongoMemoryServer;
const endpoint = `/api/workspaces/${id}/settings`;
const patch = (data: object, auth = user.id) => request(app).patch(endpoint).set("Authorization", auth).send(data);
const lifecycle = (action: string, confirmation = "Original") => request(app).post(`/api/workspaces/${id}/lifecycle`).set("Authorization", user.id).send({ action, confirmation });

describe("Workspace settings API and persistence", () => {
  beforeAll(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); }, 60000);
  afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
  beforeEach(async () => {
    await Promise.all([Workspace.deleteMany({}), UserProfile.deleteMany({}), Post.deleteMany({}), MediaAsset.deleteMany({}), FacebookConnection.deleteMany({}), LinkedInConnection.deleteMany({})]);
    await UserProfile.collection.insertOne({ _id: owner, supabaseUserId: user.id });
    await Workspace.collection.insertMany([{ _id: id, ownerUserId: owner, name: "Original", settings: { logoOverlay: { enabled: true } } }, { _id: otherId, ownerUserId: new mongoose.Types.ObjectId(), name: "Other" }]);
  });

  it("requires authentication and denies other owners without leaking records", async () => {
    expect((await request(app).get(endpoint)).status).toBe(401);
    expect((await patch({ name: "Stolen" }, "other-user")).status).toBe(404);
    expect((await request(app).get(`/api/workspaces/${otherId}/settings`).set("Authorization", user.id)).status).toBe(404);
    expect((await request(app).get("/api/workspaces/invalid/settings").set("Authorization", user.id)).status).toBe(404);
  });

  it("saves general and publishing settings, survives reload, and preserves branding", async () => {
    const result = await patch({ name: "New name", description: "Team workspace", timezone: "Asia/Manila", defaultLanguage: "fil", publishing: preferences });
    expect(result.status).toBe(200);
    const reload = await request(app).get(endpoint).set("Authorization", user.id);
    expect(reload.body.workspace).toMatchObject({ name: "New name", settings: { description: "Team workspace", timezone: "Asia/Manila", defaultLanguage: "fil", publishing: preferences, logoOverlay: { enabled: true } } });
    await patch({ description: "Changed" });
    expect((await Workspace.findById(id).lean())?.settings.publishing).toEqual(preferences);
  });

  it.each([{ timezone: "Mars/Olympus" }, { name: " " }, { defaultLanguage: "invalid" }, { ownerUserId: "hijack" }, { "settings.logoOverlay": {} }, {}, { publishing: { ...preferences, preferredTimes: ["25:00"] } }, { publishing: { ...preferences, allowedWeekdays: [] } }, { publishing: { ...preferences, minimumNoticeMinutes: -1 } }, { publishing: { ...preferences, preferredTimes: ["09:00", "09:00"] } }])("rejects invalid or unsafe settings %j", async (data) => { expect((await patch(data)).status).toBe(400); });

  it("normalizes uploaded avatars, strips metadata, and supports removal", async () => {
    const bytes = await sharp({ create: { width: 200, height: 150, channels: 3, background: "red" } }).png().toBuffer();
    const saved = await patch({ avatar: `data:image/png;base64,${bytes.toString("base64")}` });
    expect(saved.status).toBe(200);
    const avatar = saved.body.workspace.settings.avatar;
    expect(avatar).toMatch(/^data:image\/webp;base64,/);
    const metadata = await sharp(Buffer.from(avatar.split(",")[1], "base64")).metadata();
    expect(metadata).toMatchObject({ width: 128, height: 128 });
    expect(metadata.exif).toBeUndefined();
    expect((await patch({ avatar: "" })).body.workspace.settings.avatar).toBe("");
  });

  it("rejects disguised, corrupt, and oversized avatars", async () => {
    expect((await patch({ avatar: "data:image/svg+xml;base64,PHN2Zz4=" })).status).toBe(400);
    expect((await patch({ avatar: "data:image/png;base64,aGVsbG8=" })).status).toBe(400);
    expect((await patch({ avatar: "data:image/png;base64," + "a".repeat(180001) })).status).toBe(400);
  });

  it("validates default destinations against workspace, permission, status, and expiry", async () => {
    await FacebookConnection.collection.insertOne({ _id: facebook, workspaceId: id, status: "connected", tasks: ["CREATE_CONTENT"] });
    await LinkedInConnection.collection.insertOne({ _id: linkedin, workspaceId: id, status: "connected", tokenExpiresAt: new Date(Date.now() + 86400000) });
    expect((await patch({ defaultDestinations: { facebook: String(facebook), linkedin: String(linkedin) } })).status).toBe(200);
    await FacebookConnection.updateOne({ _id: facebook }, { $set: { workspaceId: otherId } });
    expect((await patch({ defaultDestinations: { facebook: String(facebook), linkedin: null } })).status).toBe(400);
    await LinkedInConnection.updateOne({ _id: linkedin }, { $set: { tokenExpiresAt: new Date(0) } });
    expect((await patch({ defaultDestinations: { facebook: null, linkedin: String(linkedin) } })).status).toBe(400);
    expect((await patch({ defaultDestinations: { facebook: null, linkedin: null } })).status).toBe(200);
  });

  it("archives, denies normal authorization and editing, lists for restoration, then restores", async () => {
    expect((await lifecycle("archive", "Wrong")).status).toBe(400);
    expect((await lifecycle("archive")).status).toBe(200);
    expect(await getUserWorkspaceById(user, String(id))).toBeNull();
    await expect(createWorkspacePost(user, { workspaceId: String(id), caption: "Blocked", platforms: [], mediaIds: [] })).rejects.toThrow("Workspace not found");
    expect((await patch({ name: "No" })).status).toBe(409);
    expect((await listUserWorkspaces(user))[0]?.archivedAt).toBeTruthy();
    expect((await request(app).get(endpoint).set("Authorization", user.id)).status).toBe(200);
    expect((await lifecycle("restore")).status).toBe(200);
    expect(await getUserWorkspaceById(user, String(id))).toBeTruthy();
  });

  it("removes deleted workspaces from all ordinary and settings reads without erasing retained records", async () => {
    expect((await lifecycle("delete")).status).toBe(200);
    expect(await Workspace.findById(id)).toBeNull();
    expect(await listUserWorkspaces(user)).toEqual([]);
    expect((await request(app).get(endpoint).set("Authorization", user.id)).status).toBe(404);
    expect((await lifecycle("restore")).status).toBe(404);
    expect(await Workspace.collection.findOne({ _id: id })).toMatchObject({ deletedAt: expect.any(Date) });
  });

  it.each(["scheduled", "publishing"])("blocks archive and deletion with %s posts", async (status) => {
    await Post.collection.insertOne({ workspaceId: id, status });
    expect((await lifecycle("archive")).status).toBe(409);
    expect((await lifecycle("delete")).status).toBe(409);
    expect(await getUserWorkspaceById(user, String(id))).toBeTruthy();
  });

  it("blocks archive and deletion while images are pending", async () => {
    await MediaAsset.collection.insertOne({ workspaceId: id, status: "pending" });
    expect((await lifecycle("archive")).status).toBe(409);
    expect((await lifecycle("delete")).status).toBe(409);
  });

  it("applies scheduling rules on creation and rescheduling, but never overrides explicit draft choices", async () => {
    await patch({ timezone: "Asia/Manila", publishing: { ...preferences, minimumNoticeMinutes: 1440 } });
    await expect(createWorkspacePost(user, { workspaceId: String(id), caption: "Explicit draft", platforms: [], mediaIds: [] })).resolves.toMatchObject({ status: "draft", platforms: [] });
    const soon = new Date(Date.now() + 3600000);
    await expect(createWorkspacePost(user, { workspaceId: String(id), caption: "Schedule", platforms: ["facebook"], mediaIds: [], scheduledAt: soon.toISOString() })).rejects.toThrow("1440 minutes");
    const postId = new mongoose.Types.ObjectId();
    await Post.collection.insertOne({ _id: postId, workspaceId: id, createdByUserId: owner, status: "scheduled", platforms: ["linkedin"], platformConnections: {}, caption: "Schedule", mediaIds: [], attemptCount: 0 });
    await expect(changeWorkspaceSchedule(user, String(postId), soon)).rejects.toThrow("1440 minutes");
  });
});

describe("Scheduling rule boundaries", () => {
  const now = new Date("2026-11-20T00:00:00Z");
  const settings = { timezone: "Asia/Manila", publishing: preferences };
  it("uses the workspace weekday rather than the UTC weekday", () => {
    expect(schedulingRuleError(settings, new Date("2026-11-22T16:00:00Z"), now)).toBeNull(); // Monday in Manila
    expect(schedulingRuleError(settings, new Date("2026-11-20T16:00:00Z"), now)).toMatch(/weekday/); // Saturday
  });
  it("enforces notice and horizon boundaries while preserving legacy workspaces", () => {
    expect(schedulingRuleError(settings, new Date("2026-11-20T00:59:00Z"), now)).toMatch(/60 minutes/);
    expect(schedulingRuleError(settings, new Date("2026-11-20T01:00:00Z"), now)).toBeNull();
    expect(schedulingRuleError(settings, new Date("2026-12-21T00:00:00Z"), now)).toMatch(/30 days/);
    expect(schedulingRuleError({}, new Date("2026-12-21T00:00:00Z"), now)).toBeNull();
    expect(workspaceSettingsPatchSchema.safeParse({ publishing: { ...preferences, approvalRequired: true } }).success).toBe(false);
  });
});
