import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import UserProfile from "../models/UserProfile.js";
import Workspace from "../models/Workspace.js";
import MediaAsset from "../models/MediaAsset.js";
import Post from "../models/Post.js";

import { createWorkspacePost, updateWorkspaceDraft } from "./postService.js";

import { getImageStorageKey } from "./media/supabaseImageStorage.js";

const ids = {
  owner: new mongoose.Types.ObjectId(),
  otherUser: new mongoose.Types.ObjectId(),

  workspaceA: new mongoose.Types.ObjectId(),
  workspaceB: new mongoose.Types.ObjectId(),
  otherWorkspace: new mongoose.Types.ObjectId(),

  imageA: new mongoose.Types.ObjectId(),
  imageB: new mongoose.Types.ObjectId(),
  privateImage: new mongoose.Types.ObjectId(),
};

const authUser = {
  id: "media-integration-owner",
  email: "media-owner@example.test",
};

let mongo: MongoMemoryServer;

const oid = (id: mongoose.Types.ObjectId) => String(id);

async function seedAsset(
  assetId: mongoose.Types.ObjectId,
  workspaceId: mongoose.Types.ObjectId,
  ownerId: mongoose.Types.ObjectId,
  status: "ready" | "pending" | "failed" = "ready",
) {
  // Integration-test fixture.
  // Insert directly to focus on post-service behavior.
  await MediaAsset.collection.insertOne({
    _id: assetId,
    workspaceId,
    createdByUserId: ownerId,
    type: "image",
    source: "ai-generated",
    status,
    storageProvider: "supabase",
    storageKey: getImageStorageKey(String(workspaceId), String(assetId)),
    mimeType: "image/png",
    width: 1024,
    height: 1024,
    fileSize: 4096,

    idempotencyKey: `test-generation-${String(assetId)}`,
    generationExecution: {
      phase: "storage_pending",
      attemptCount: 1,
    },

    contentSha256: "a".repeat(64),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function seedDatabase() {
  // Raw driver inserts avoid requiring unrelated
  // profile and workspace application fields.
  //
  // These records exist ONLY in the memory database.
  await UserProfile.collection.insertMany([
    {
      _id: ids.owner,
      supabaseUserId: authUser.id,
    },
    {
      _id: ids.otherUser,
      supabaseUserId: "different-user",
    },
  ]);

  await Workspace.collection.insertMany([
    {
      _id: ids.workspaceA,
      ownerUserId: ids.owner,
      name: "Coffee Shop",
    },
    {
      _id: ids.workspaceB,
      ownerUserId: ids.owner,
      name: "Beauty Brand",
    },
    {
      _id: ids.otherWorkspace,
      ownerUserId: ids.otherUser,
      name: "Private Workspace",
    },
  ]);

  await seedAsset(ids.imageA, ids.workspaceA, ids.owner);

  await seedAsset(ids.imageB, ids.workspaceB, ids.owner);

  await seedAsset(ids.privateImage, ids.otherWorkspace, ids.otherUser);
}

async function createDraft(mediaIds: string[] = []) {
  return createWorkspacePost(authUser, {
    workspaceId: oid(ids.workspaceB),
    title: "Integration test draft",
    caption: "Testing image persistence.",
    platforms: ["instagram"],
    mediaIds,
  });
}

describe("Post media persistence integration", () => {
  beforeAll(async () => {
    // An isolated MongoDB process is created
    // specifically for this test suite.
    mongo = await MongoMemoryServer.create();

    await mongoose.connect(mongo.getUri(), {
      dbName: "storm_post_media_integration",
    });
  }, 60000);

  beforeEach(async () => {
    // These deletes affect only MongoMemoryServer.
    await Promise.all([
      Post.deleteMany({}),
      MediaAsset.deleteMany({}),
      Workspace.deleteMany({}),
      UserProfile.deleteMany({}),
    ]);

    await seedDatabase();
  });

  afterAll(async () => {
    await mongoose.disconnect();

    if (mongo) {
      await mongo.stop();
    }
  });

  it("saves an image from another owned workspace", async () => {
    const draft = await createDraft([oid(ids.imageA)]);

    expect(draft.status).toBe("draft");
    expect(draft.mediaIds.map(String)).toEqual([oid(ids.imageA)]);

    expect(String(draft.workspaceId)).toBe(oid(ids.workspaceB));

    const persisted = await Post.findById(draft._id).lean();

    expect(persisted?.mediaIds.map(String)).toEqual([oid(ids.imageA)]);
  });

  it("rejects images owned by another user", async () => {
    await expect(createDraft([oid(ids.privateImage)])).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(await Post.countDocuments()).toBe(0);
  });

  it("rejects pending images", async () => {
    await MediaAsset.updateOne(
      { _id: ids.imageA },
      { $set: { status: "pending" } },
    );

    await expect(createDraft([oid(ids.imageA)])).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("preserves attachments during caption-only updates", async () => {
    const draft = await createDraft([oid(ids.imageA)]);

    const updated = await updateWorkspaceDraft(authUser, String(draft._id), {
      caption: "Updated caption.",
    });

    expect(updated.caption).toBe("Updated caption.");

    expect(updated.mediaIds.map(String)).toEqual([oid(ids.imageA)]);
  });

  it("replaces a saved image", async () => {
    const draft = await createDraft([oid(ids.imageA)]);

    const updated = await updateWorkspaceDraft(authUser, String(draft._id), {
      mediaIds: [oid(ids.imageB)],
    });

    expect(updated.mediaIds.map(String)).toEqual([oid(ids.imageB)]);
  });

  it("explicitly removes saved images", async () => {
    const draft = await createDraft([oid(ids.imageA)]);

    const updated = await updateWorkspaceDraft(authUser, String(draft._id), {
      mediaIds: [],
    });

    expect(updated.mediaIds).toEqual([]);

    const persisted = await Post.findById(draft._id).lean();

    expect(persisted?.mediaIds).toEqual([]);
  });

  it("rejects media changes after draft status changes", async () => {
    const draft = await createDraft([oid(ids.imageA)]);

    await Post.updateOne({ _id: draft._id }, { $set: { status: "published" } });

    await expect(
      updateWorkspaceDraft(authUser, String(draft._id), { mediaIds: [] }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("protects the persisted draft with version checks", async () => {
    const draft = await createDraft([oid(ids.imageA)]);

    const original = await Post.findById(draft._id).select("__v").lean();

    expect(original).not.toBeNull();

    const originalVersion = original!.__v;

    // The service increments __v when updating.
    await updateWorkspaceDraft(authUser, String(draft._id), {
      caption: "First update.",
    });

    // Simulate a second writer holding an older
    // snapshot and attempting a stale write.
    const staleWrite = await Post.findOneAndUpdate(
      {
        _id: draft._id,
        status: "draft",
        __v: originalVersion,
      },
      {
        $set: {
          caption: "Stale update.",
        },
        $inc: {
          __v: 1,
        },
      },
      { returnDocument: "after" },
    );

    expect(staleWrite).toBeNull();

    const persisted = await Post.findById(draft._id).lean();

    expect(persisted?.caption).toBe("First update.");

    expect(persisted?.__v).toBe(originalVersion + 1);
  });

  it("does not allow scheduled posts containing media", async () => {
    await expect(
      createWorkspacePost(authUser, {
        workspaceId: oid(ids.workspaceB),
        title: "Scheduled image",
        caption: "Scheduled image test.",
        platforms: ["facebook"],
        platformConnections: {
          facebook: oid(ids.imageB),
        },
        mediaIds: [oid(ids.imageA)],
        scheduledAt: "2035-01-01T12:00:00.000Z",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(await Post.countDocuments()).toBe(0);
  });
});
