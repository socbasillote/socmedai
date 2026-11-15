import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import UserProfile from "../../models/UserProfile.js";
import Workspace from "../../models/Workspace.js";
import MediaAsset from "../../models/MediaAsset.js";
import Post from "../../models/Post.js";

import { getImageStorageKey } from "./supabaseImageStorage.js";

import {
  createWorkspacePost,
  getWorkspacePostById,
  updateWorkspaceDraft,
} from "../postService.js";

import {
  getAuthorizedMediaLibraryItem,
  listAuthorizedMediaLibrary,
} from "./mediaLibraryService.js";

import { validateDraftMediaAttachments } from "./validateDraftMediaAttachments.js";

const ids = {
  owner: new mongoose.Types.ObjectId(),
  otherUser: new mongoose.Types.ObjectId(),
  sourceWorkspace: new mongoose.Types.ObjectId(),
  targetWorkspace: new mongoose.Types.ObjectId(),
  image: new mongoose.Types.ObjectId(),
};

const authUser = {
  id: "cross-workspace-test-owner",
  email: "owner@example.test",
};

const str = (id: mongoose.Types.ObjectId) => String(id);

let mongo: MongoMemoryServer;

async function seedDatabase() {
  await UserProfile.collection.insertMany([
    {
      _id: ids.owner,
      supabaseUserId: authUser.id,
    },
    {
      _id: ids.otherUser,
      supabaseUserId: "another-user",
    },
  ]);

  await Workspace.collection.insertMany([
    {
      _id: ids.sourceWorkspace,
      ownerUserId: ids.owner,
      name: "Coffee Shop",
    },
    {
      _id: ids.targetWorkspace,
      ownerUserId: ids.owner,
      name: "Beauty Brand",
    },
  ]);

  await MediaAsset.collection.insertOne({
    _id: ids.image,
    workspaceId: ids.sourceWorkspace,
    createdByUserId: ids.owner,
    type: "image",
    source: "ai-generated",
    status: "ready",
    storageProvider: "supabase",
    storageKey: getImageStorageKey(
      String(ids.sourceWorkspace),
      String(ids.image),
    ),

    mimeType: "image/png",
    width: 1024,
    height: 1024,
    fileSize: 4096,

    idempotencyKey: `test-generation-${String(ids.image)}`,

    generationExecution: {
      phase: "storage_pending",
      attemptCount: 1,
    },

    contentSha256: "a".repeat(64),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function revokeSourceWorkspaceAccess() {
  await Workspace.updateOne(
    { _id: ids.sourceWorkspace },
    {
      $set: {
        ownerUserId: ids.otherUser,
      },
    },
  );
}

describe("Cross-workspace media access integration", () => {
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();

    await mongoose.connect(mongo.getUri(), {
      dbName: "storm_cross_workspace_access_tests",
    });
  }, 60000);

  beforeEach(async () => {
    await Post.deleteMany({});
    await MediaAsset.deleteMany({});
    await Workspace.deleteMany({});
    await UserProfile.deleteMany({});

    await seedDatabase();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
  });

  it("allows metadata access while the source workspace is owned", async () => {
    const image = await getAuthorizedMediaLibraryItem(authUser, str(ids.image));

    expect(image).toMatchObject({
      assetId: str(ids.image),
      sourceWorkspaceId: str(ids.sourceWorkspace),
      sourceWorkspaceName: "Coffee Shop",
    });
  });

  it("removes revoked workspaces from the All Workspaces library", async () => {
    const before = await listAuthorizedMediaLibrary({
      authUser,
      workspaceId: str(ids.targetWorkspace),
      scope: "all",
    });

    expect(before.images.map((image) => image.assetId)).toContain(
      str(ids.image),
    );

    await revokeSourceWorkspaceAccess();

    const after = await listAuthorizedMediaLibrary({
      authUser,
      workspaceId: str(ids.targetWorkspace),
      scope: "all",
    });

    expect(after.images.map((image) => image.assetId)).not.toContain(
      str(ids.image),
    );
  });

  it("denies media detail lookup after source workspace access is revoked", async () => {
    await revokeSourceWorkspaceAccess();

    await expect(
      getAuthorizedMediaLibraryItem(authUser, str(ids.image)),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("denies new attachments after source workspace access is revoked", async () => {
    await revokeSourceWorkspaceAccess();

    await expect(
      validateDraftMediaAttachments({
        authUser,
        destinationWorkspaceId: str(ids.targetWorkspace),
        mediaIds: [str(ids.image)],
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "One or more media attachments are unavailable.",
    });
  });

  it("preserves saved post references without granting renewed media access", async () => {
    const draft = await createWorkspacePost(authUser, {
      workspaceId: str(ids.targetWorkspace),
      title: "Coffee promotion",
      caption: "Previously authorized image.",
      platforms: ["instagram"],
      mediaIds: [str(ids.image)],
    });

    expect(draft.mediaIds.map(String)).toEqual([str(ids.image)]);

    await revokeSourceWorkspaceAccess();

    // The draft still exists in the target workspace.
    const savedPost = await getWorkspacePostById(authUser, String(draft._id));

    expect(savedPost.mediaIds.map(String)).toEqual([str(ids.image)]);

    // But the original image cannot be looked up
    // through the authenticated library anymore.
    await expect(
      getAuthorizedMediaLibraryItem(authUser, str(ids.image)),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    // Users can explicitly remove a now-unavailable
    // media reference from their draft.
    const updated = await updateWorkspaceDraft(authUser, String(draft._id), {
      mediaIds: [],
    });

    expect(updated.mediaIds).toEqual([]);
  });

  it("hides images with inconsistent private storage keys", async () => {
    await MediaAsset.collection.updateOne(
      { _id: ids.image },
      {
        $set: {
          storageKey: "invalid/private/image.png",
        },
      },
    );

    const library = await listAuthorizedMediaLibrary({
      authUser,
      workspaceId: str(ids.targetWorkspace),
      scope: "all",
    });

    expect(
      library.images.some((image) => image.assetId === str(ids.image)),
    ).toBe(false);

    await expect(
      getAuthorizedMediaLibraryItem(authUser, str(ids.image)),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("hides images without verified generation metadata", async () => {
    await MediaAsset.collection.updateOne(
      { _id: ids.image },
      {
        $unset: {
          contentSha256: "",
        },
      },
    );

    const library = await listAuthorizedMediaLibrary({
      authUser,
      workspaceId: str(ids.targetWorkspace),
      scope: "all",
    });

    expect(
      library.images.some((image) => image.assetId === str(ids.image)),
    ).toBe(false);

    await expect(
      getAuthorizedMediaLibraryItem(authUser, str(ids.image)),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
