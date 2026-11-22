import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import Post from "../models/Post.js";
import UserProfile from "../models/UserProfile.js";
import Workspace from "../models/Workspace.js";
import LinkedInConnection from "../models/LinkedInConnection.js";
import { autosaveWorkspaceDraft, createWorkspacePost, validateWorkspacePostBatch, PostServiceError } from "./postService.js";
import { createPostSchema, createPostRequestSchema } from "../schemas/postSchema.js";
let mongo: MongoMemoryReplSet;
const ownerId = new mongoose.Types.ObjectId();
const workspaceId = new mongoose.Types.ObjectId();
const connectionId = new mongoose.Types.ObjectId();
const auth = { id: "bulk-scheduling-owner", email: "bulk@example.test" };
const clientDraftId = "11111111-2222-4333-8444-555555555555";
function input() {
  return { workspaceId: String(workspaceId), clientDraftId, title: "A scheduled post", caption: "A useful caption",
    platforms: ["linkedin" as const], mediaIds: [], platformConnections: { linkedin: String(connectionId) },
    scheduledAt: new Date(Date.now() + 86400000).toISOString() };
}
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Post.createIndexes();
});
beforeEach(async () => {
  vi.restoreAllMocks();
  process.env.SCHEDULED_PUBLISHING_ENABLED = "true";
  await Promise.all([Post.deleteMany({}), Workspace.deleteMany({}), UserProfile.deleteMany({}), LinkedInConnection.deleteMany({})]);
  await UserProfile.collection.insertOne({ _id: ownerId, supabaseUserId: auth.id });
  await Workspace.collection.insertOne({ _id: workspaceId, ownerUserId: ownerId });
  await LinkedInConnection.collection.insertOne({ _id: connectionId, workspaceId, status: "connected", scopes: ["w_member_social"], tokenExpiresAt: new Date(Date.now() + 30 * 86400000) });
});
afterAll(async () => { vi.restoreAllMocks(); await mongoose.disconnect(); await mongo?.stop(); });
it("recovers an identical committed request without creating or modifying another post", async () => {
  const request = input();
  const saved = await createWorkspacePost(auth, request);
  const retried = await createWorkspacePost(auth, request);
  expect(String(retried._id)).toBe(String(saved._id));
  expect(retried.status).toBe("scheduled");
  expect(retried).not.toHaveProperty("creationRequestHash");
  expect(await Post.countDocuments()).toBe(1);
});
it("recovers after the scheduled time passed, credentials were revoked, or publishing was disabled", async () => {
  const request = input();
  const saved = await createWorkspacePost(auth, request);
  await LinkedInConnection.updateOne({ _id: connectionId }, { $set: { status: "revoked" } });
  await Post.updateOne({ _id: saved._id }, { $set: { status: "published" } });
  process.env.SCHEDULED_PUBLISHING_ENABLED = "false";
  vi.spyOn(Date, "now").mockReturnValue(Date.parse(request.scheduledAt) + 1000);
  expect(createPostSchema.safeParse(request).success).toBe(false);
  expect(createPostRequestSchema.safeParse(request).success).toBe(true);
  const result = await createWorkspacePost(auth, request);
  expect(String(result._id)).toBe(String(saved._id));
  expect(result.status).toBe("published");
  expect((await validateWorkspacePostBatch(auth, [request])).issues).toEqual([]);
  expect(await Post.countDocuments()).toBe(1);
});
it("rejects reuse of a committed request key for changed content or a different action", async () => {
  const request = input();
  await createWorkspacePost(auth, request);
  for (const change of [{ caption: "Changed" }, { scheduledAt: undefined }, { mediaIds: [String(new mongoose.Types.ObjectId())] }]) {
    await assert.rejects(createWorkspacePost(auth, { ...request, ...change }), error => error instanceof PostServiceError && error.statusCode === 409);
  }
  expect(await Post.countDocuments()).toBe(1);
  expect((await Post.findOne()).caption).toBe(request.caption);
});
it("deduplicates concurrent identical finalization requests", async () => {
  const request = input();
  const [first, second] = await Promise.all([createWorkspacePost(auth, request), createWorkspacePost(auth, request)]);
  expect(String(first._id)).toBe(String(second._id));
  expect(await Post.countDocuments()).toBe(1);
});
it("validates every date against current workspace rules before any posts are created", async () => {
  const first = input();
  const firstDate = new Date(first.scheduledAt);
  const second = { ...first, clientDraftId: "22222222-2222-4333-8444-555555555555", scheduledAt: new Date(firstDate.getTime() + 86400000).toISOString() };
  await Workspace.updateOne({ _id: workspaceId }, { $set: { settings: { timezone: "UTC", publishing: {
    defaultPostMode: "draft", preferredTimes: [], allowedWeekdays: [firstDate.getUTCDay()], minimumNoticeMinutes: 0, maximumAdvanceDays: 30,
  } } } });
  expect(await validateWorkspacePostBatch(auth, [first, second])).toEqual({ issues: [{ index: 1, message: "This weekday is disabled in workspace publishing preferences." }] });
  expect(await Post.countDocuments()).toBe(0);
});
it("preflight enforces notice and advance limits, and validates all entries without writes", async () => {
  const first = input();
  await Workspace.updateOne({ _id: workspaceId }, { $set: { settings: { timezone: "UTC", publishing: {
    defaultPostMode: "draft", preferredTimes: [], allowedWeekdays: [0, 1, 2, 3, 4, 5, 6], minimumNoticeMinutes: 60, maximumAdvanceDays: 2,
  } } } });
  const result = await validateWorkspacePostBatch(auth, [
    { ...first, scheduledAt: new Date(Date.now() + 1000).toISOString() },
    { ...first, scheduledAt: new Date(Date.now() + 3 * 86400000).toISOString() },
  ]);
  expect(result.issues).toEqual([{ index: 0, message: "Schedule at least 60 minutes in advance." }, { index: 1, message: "Schedule within 2 days." }]);
  expect(await Post.countDocuments()).toBe(0);
});
it("does not recover another user's committed request", async () => {
  const request = input();
  await createWorkspacePost(auth, request);
  await assert.rejects(createWorkspacePost({ id: "another-user", email: "other@example.test" }, request), error => error instanceof PostServiceError && error.statusCode === 404);
});
it("still rejects a new schedule in the past even with a new retry key", async () => {
  await assert.rejects(createWorkspacePost(auth, { ...input(), scheduledAt: "2020-01-01T00:00:00Z" }), error => error instanceof PostServiceError && error.statusCode === 400);
  expect(await Post.countDocuments()).toBe(0);
});

it("finalizes a schedule when its first autosave races admission", async () => {
  const request = input();
  const [, finalized] = await Promise.all([
    autosaveWorkspaceDraft(auth, { workspaceId: request.workspaceId, clientDraftId, revision: 1,
      title: "Working draft", caption: "Working caption", platforms: ["linkedin"], mediaIds: [] }),
    createWorkspacePost(auth, request),
  ]);
  const stored = await Post.findById(finalized._id);
  expect(await Post.countDocuments()).toBe(1);
  expect(stored).toMatchObject({ status: "scheduled", caption: request.caption, autosaveClosed: true });
});
