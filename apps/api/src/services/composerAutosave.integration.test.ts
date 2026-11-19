import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import Post from "../models/Post.js";
import UserProfile from "../models/UserProfile.js";
import Workspace from "../models/Workspace.js";
import { autosaveWorkspaceDraft, createWorkspacePost } from "./postService.js";
import { autosaveDraftSchema } from "../schemas/postSchema.js";

let mongo: MongoMemoryServer;
const userId = new mongoose.Types.ObjectId();
const workspaceId = new mongoose.Types.ObjectId();
const auth = { id: "autosave-user", email: "autosave@example.test" };
const clientDraftId = "11111111-2222-4333-8444-555555555555";
function input(revision = 1, caption = "") {
  return { workspaceId: String(workspaceId), clientDraftId, revision, title: "", caption, mediaIds: [], platforms: [] };
}
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Post.createIndexes();
  await UserProfile.collection.insertOne({ _id: userId, supabaseUserId: auth.id });
  await Workspace.collection.insertOne({ _id: workspaceId, ownerUserId: userId, name: "Autosave" });
});
beforeEach(async () => { await Post.deleteMany({}); });
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });

describe("composer draft autosave", () => {
  it("persists an incomplete Untitled draft and updates the same record", async () => {
    const first = await autosaveWorkspaceDraft(auth, input());
    expect(first).toMatchObject({ title: "Untitled", status: "draft", caption: "" });
    const updated = await autosaveWorkspaceDraft(auth, input(2, "My caption"));
    expect(String(updated._id)).toBe(String(first._id));
    expect(updated.caption).toBe("My caption");
    expect(await Post.countDocuments()).toBe(1);
  });
  it("rejects stale revisions and deduplicates concurrent retries", async () => {
    await Promise.all([autosaveWorkspaceDraft(auth, input(2, "Latest")), autosaveWorkspaceDraft(auth, input(2, "Latest"))]);
    const post = await autosaveWorkspaceDraft(auth, input(1, "Stale"));
    expect(post.caption).toBe("Latest");
    expect(await Post.countDocuments()).toBe(1);
  });
  it("finalizes the same draft and ignores delayed autosaves", async () => {
    const first = await autosaveWorkspaceDraft(auth, input(1, "Working"));
    const saved = await createWorkspacePost(auth, {
      workspaceId: String(workspaceId), clientDraftId, title: "Final", caption: "Final caption", platforms: ["linkedin"], mediaIds: [],
    });
    expect(String(saved._id)).toBe(String(first._id));
    await autosaveWorkspaceDraft(auth, input(999, "Late request"));
    expect((await Post.findById(first._id)).caption).toBe("Final caption");
    expect(await Post.countDocuments()).toBe(1);
  });
  it("keeps a single final record when explicit save races autosave", async () => {
    const [saved] = await Promise.all([
      createWorkspacePost(auth, { workspaceId: String(workspaceId), clientDraftId,
        title: "Final", caption: "Final caption", platforms: ["linkedin"], mediaIds: [] }),
      autosaveWorkspaceDraft(auth, input(1, "Earlier caption")),
    ]);
    expect(await Post.countDocuments()).toBe(1);
    expect((await Post.findById(saved._id)).caption).toBe("Final caption");
  });
  it("cannot recreate or overwrite a post that has already published", async () => {
    const first = await autosaveWorkspaceDraft(auth, input(1, "Published content"));
    await Post.updateOne({ _id: first._id }, { $set: { status: "published" } });
    await autosaveWorkspaceDraft(auth, input(999, "Late request"));
    expect(await Post.countDocuments()).toBe(1);
    expect((await Post.findById(first._id)).status).toBe("published");
    expect((await Post.findById(first._id)).caption).toBe("Published content");
  });

  it("does not authorize a different account", async () => {
    await expect(autosaveWorkspaceDraft({ id: "another-user", email: "other@example.test" }, input())).rejects.toMatchObject({ statusCode: 404 });
    expect(await Post.countDocuments()).toBe(0);
  });
  it("does not autoschedule and rejects unknown state or ownership fields", async () => {
    const post = await autosaveWorkspaceDraft(auth, { ...input(), scheduledAt: "2026-11-16T08:00:00Z" });
    expect(post.status).toBe("draft");
    expect(autosaveDraftSchema.safeParse({ ...input(), status: "published" }).success).toBe(false);
    expect(autosaveDraftSchema.safeParse({ ...input(), createdByUserId: "other" }).success).toBe(false);
  });
});
