import FacebookConnection from "../models/FacebookConnection.js";
import LinkedInConnection from "../models/LinkedInConnection.js";
import { createPostSchema } from "../schemas/postSchema.js";
import { claimNextDuePost } from "./scheduledPostWorker.js";
import { claimImmediatePost } from "./publishing/immediatePublishingService.js";
import { dispatchScheduledPost } from "./publishing/scheduledPublishingDispatcher.js";
import { ScheduledLeaseSignal } from "./publishing/scheduledPublishingHeartbeat.js";
import { FacebookPublishingAdapter } from "./publishing/facebookPublishingAdapter.js";
import { LinkedInPublishingAdapter } from "./publishing/linkedinPublishingAdapter.js";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  beforeEach(async () => {
    vi.stubEnv("FACEBOOK_PUBLISHING_ENABLED", "true");
    vi.stubEnv("SCHEDULED_PUBLISHING_ENABLED", "true");
    // These deletes affect only MongoMemoryServer.
    await Promise.all([
      Post.deleteMany({}),
      FacebookConnection.deleteMany({}),
      LinkedInConnection.deleteMany({}),
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

  it("rejects scheduled image posts without an authorized Page", async () => {
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
      statusCode: 404,
    });

    expect(await Post.countDocuments()).toBe(0);
  });

  it.each(["facebook", "linkedin"] as const)("saves, claims, and dispatches a scheduled %s image exactly once", async (platform) => {
    const connectionId = new mongoose.Types.ObjectId();
    if (platform === "facebook") {
      await FacebookConnection.collection.insertOne({ _id: connectionId, workspaceId: ids.workspaceB, status: "connected", tasks: ["CREATE_CONTENT"] });
    } else {
      await LinkedInConnection.collection.insertOne({ _id: connectionId, workspaceId: ids.workspaceB, status: "connected", scopes: ["w_member_social"], tokenExpiresAt: new Date(Date.now() + 86400000) });
    }
    const scheduledAt = new Date(Date.now() + 60000).toISOString();
    const input = createPostSchema.parse({ workspaceId: oid(ids.workspaceB), caption: "Scheduled image", platforms: [platform], mediaIds: [oid(ids.imageB)], platformConnections: { [platform]: String(connectionId) }, scheduledAt });
    const post = await createWorkspacePost(authUser, input);
    await Post.updateOne({ _id: post._id }, { $set: { scheduledAt: new Date(Date.now() - 1000) } });
    const claimed = await claimNextDuePost();
    expect(String(claimed?._id)).toBe(String(post._id));
    expect(await claimNextDuePost()).toBeNull();
    const adapter = platform === "facebook" ? FacebookPublishingAdapter.prototype : LinkedInPublishingAdapter.prototype;
    const publish = vi.spyOn(adapter, "publish").mockImplementation(async (request) => {
      request.lease?.assertOwnership();
      return { outcome: "published", postId: request.postId, platform, externalPostId: "test-external-post", publishedAt: new Date() };
    });
    await dispatchScheduledPost(String(post._id), new ScheduledLeaseSignal());
    expect(publish).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ platform, mediaIds: [oid(ids.imageB)], connectionId: String(connectionId), lease: expect.any(ScheduledLeaseSignal) }));
    const stored = await Post.findById(post._id).lean();
    expect(stored?.status).toBe("published");
    expect(stored?.platformResults[0].externalPostId).toBe("test-external-post");
  });

  it("rejects scheduling when the worker is disabled without saving a queued post", async () => {
    vi.stubEnv("SCHEDULED_PUBLISHING_ENABLED", "false");
    await expect(createWorkspacePost(authUser, { workspaceId: oid(ids.workspaceB), caption: "Disabled schedule", platforms: ["facebook"], mediaIds: [], scheduledAt: new Date(Date.now() + 60000).toISOString() })).rejects.toMatchObject({ statusCode: 409 });
    expect(await Post.countDocuments()).toBe(0);
  });

  it("leaves Facebook drafts and schedules untouched when Facebook publishing is disabled", async () => {
    vi.stubEnv("FACEBOOK_PUBLISHING_ENABLED", "false");
    const post = await Post.create({ workspaceId: ids.workspaceB, createdByUserId: ids.owner, caption: "Disabled Facebook", platforms: ["facebook"], mediaIds: [], platformConnections: { facebook: ids.imageB }, status: "draft" });
    await expect(claimImmediatePost({ authUser, workspaceId: oid(ids.workspaceB), postId: String(post._id) })).rejects.toMatchObject({ statusCode: 409 });
    expect((await Post.findById(post._id))?.attemptCount).toBe(0);
    await Post.updateOne({ _id: post._id }, { $set: { status: "scheduled", scheduledAt: new Date(Date.now() - 1000) } });
    expect(await claimNextDuePost()).toBeNull();
    expect((await Post.findById(post._id))?.status).toBe("scheduled");
  });

});
