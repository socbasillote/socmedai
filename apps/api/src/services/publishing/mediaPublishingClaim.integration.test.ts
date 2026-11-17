import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { beforeAll, afterAll, beforeEach, expect, it, vi } from "vitest";
vi.mock("./publishingAuthorizationService.js", () => ({ authorizePublishing: vi.fn(), PublishingAuthorizationError: class extends Error {} }));
vi.mock("../workspaceService.js", () => ({ getUserWorkspaceById: async (_user: unknown, id: string) => ({ _id: id }), isValidWorkspaceId: (id: string) => mongoose.isValidObjectId(id) }));
import Post from "../../models/Post.js";
import { claimImmediatePost } from "./immediatePublishingService.js";
import { claimImmediateFacebookPost } from "./facebookImmediatePublishingService.js";
let mongo: MongoMemoryServer;
const workspaceId = new mongoose.Types.ObjectId();
const authUser = { id: "test", email: null };
beforeAll(async () => {
  mongo = await MongoMemoryServer.create({ instance: { launchTimeout: 60_000 } });
  await mongoose.connect(mongo.getUri());
}, 70_000);
beforeEach(async () => { await Post.deleteMany({}); });
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
async function draft(platform: "facebook" | "linkedin", count = 1) {
  return Post.create({ workspaceId, createdByUserId: new mongoose.Types.ObjectId(), caption: "Caption with an image", platforms: [platform],
    platformConnections: { [platform]: new mongoose.Types.ObjectId() }, status: "draft", mediaIds: Array.from({ length: count }, () => new mongoose.Types.ObjectId()) });
}
it.each(["facebook", "linkedin"] as const)("atomically claims a %s image draft once", async (platform) => {
  const post = await draft(platform);
  const input = { authUser, workspaceId: String(workspaceId), postId: String(post._id) };
  const outcomes = await Promise.allSettled([claimImmediatePost(input), claimImmediatePost(input)]);
  expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
  expect((await Post.findById(post._id))?.mediaIds).toHaveLength(1);
  expect((await Post.findById(post._id))?.attemptCount).toBe(1);
});
it("rejects multiple images without claiming the draft", async () => {
  const post = await draft("linkedin", 2);
  await expect(claimImmediatePost({ authUser, workspaceId: String(workspaceId), postId: String(post._id) })).rejects.toMatchObject({ statusCode: 409 });
  expect((await Post.findById(post._id))?.status).toBe("draft");
});
it("supports images in the internal Facebook claim path", async () => {
  const post = await draft("facebook");
  expect((await claimImmediateFacebookPost({ authUser, workspaceId: String(workspaceId), postId: String(post._id) })).mediaIds).toHaveLength(1);
});
