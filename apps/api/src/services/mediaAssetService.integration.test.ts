import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import MediaAsset from "../models/MediaAsset.js";
import UserProfile from "../models/UserProfile.js";
import Workspace from "../models/Workspace.js";

import type { AuthenticatedUser } from "./userProfileService.js";

import {
  createPendingMediaAsset,
  getWorkspaceMediaAsset,
  listWorkspaceMediaAssets,
  markMediaAssetFailed,
  markMediaAssetReady,
} from "./mediaAssetService.js";

let mongo: MongoMemoryServer;

const userA = {
  id: "supabase-test-user-a",
} as AuthenticatedUser;

const userB = {
  id: "supabase-test-user-b",
} as AuthenticatedUser;

let workspaceA: string;
let workspaceB: string;

const generationInput = {
  prompt: "A professional product photograph on a wooden desk.",
  aspectRatio: "square" as const,
};

const generationConfig = {
  provider: "openai",
  model: "test-image-model",
};

function readyMetadata() {
  return {
    storageKey:
      `workspaces/${workspaceA}/images/` +
      `${new mongoose.Types.ObjectId()}.png`,
    mimeType: "image/png" as const,
    width: 1024,
    height: 1024,
    fileSize: 400_000,
  };
}

async function createPending() {
  return createPendingMediaAsset(
    userA,
    workspaceA,
    generationInput,
    generationConfig,
  );
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();

  await mongoose.connect(mongo.getUri());

  // Enforce actual database indexes, not just
  // the declarations checked by model tests.
  await MediaAsset.createIndexes();
});

beforeEach(async () => {
  await MediaAsset.deleteMany({});

  await Workspace.collection.deleteMany({});
  await UserProfile.collection.deleteMany({});

  const profileA = new mongoose.Types.ObjectId();
  const profileB = new mongoose.Types.ObjectId();

  // Insert minimal authorization fixtures.
  // The production service still uses the real
  // UserProfile and Workspace models.
  await UserProfile.collection.insertMany([
    {
      _id: profileA,
      supabaseUserId: userA.id,
    },
    {
      _id: profileB,
      supabaseUserId: userB.id,
    },
  ]);

  const idA = new mongoose.Types.ObjectId();
  const idB = new mongoose.Types.ObjectId();

  await Workspace.collection.insertMany([
    {
      _id: idA,
      ownerUserId: profileA,
      name: "Workspace A",
    },
    {
      _id: idB,
      ownerUserId: profileB,
      name: "Workspace B",
    },
  ]);

  workspaceA = String(idA);
  workspaceB = String(idB);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

describe("MediaAsset service integration", () => {
  it("creates a pending asset in the authorized workspace", async () => {
    const asset = await createPending();

    expect(asset.status).toBe("pending");
    expect(String(asset.workspaceId)).toBe(workspaceA);

    const saved = await MediaAsset.findById(asset._id);

    expect(saved).not.toBeNull();
    expect(saved?.generation.prompt).toBe(generationInput.prompt);
  });

  it("rejects creation in another user's workspace", async () => {
    await expect(
      createPendingMediaAsset(
        userB,
        workspaceA,
        generationInput,
        generationConfig,
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(await MediaAsset.countDocuments({})).toBe(0);
  });

  it("rejects invalid workspace identifiers", async () => {
    await expect(
      createPendingMediaAsset(
        userA,
        "invalid-workspace",
        generationInput,
        generationConfig,
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("restricts asset retrieval to its workspace", async () => {
    const asset = await createPending();

    const own = await getWorkspaceMediaAsset(
      userA,
      workspaceA,
      String(asset._id),
    );

    expect(String(own._id)).toBe(String(asset._id));

    await expect(
      getWorkspaceMediaAsset(userB, workspaceB, String(asset._id)),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("lists only authorized workspace assets", async () => {
    const assetA = await createPending();

    await createPendingMediaAsset(
      userB,
      workspaceB,
      generationInput,
      generationConfig,
    );

    const list = await listWorkspaceMediaAssets(userA, workspaceA);

    expect(list).toHaveLength(1);
    expect(String(list[0]?._id)).toBe(String(assetA._id));

    await expect(
      listWorkspaceMediaAssets(userB, workspaceA),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("marks a valid pending asset ready", async () => {
    const asset = await createPending();

    const metadata = readyMetadata();

    const ready = await markMediaAssetReady(
      userA,
      workspaceA,
      String(asset._id),
      metadata,
    );

    expect(ready.status).toBe("ready");
    expect(ready.storageKey).toBe(metadata.storageKey);

    const persisted = await MediaAsset.findById(asset._id);

    expect(persisted?.status).toBe("ready");
    expect(persisted?.width).toBe(1024);
  });

  it("rejects incomplete ready metadata", async () => {
    const asset = await createPending();

    await expect(
      markMediaAssetReady(userA, workspaceA, String(asset._id), {
        ...readyMetadata(),
        width: 0,
      }),
    ).rejects.toThrow();

    const persisted = await MediaAsset.findById(asset._id);

    expect(persisted?.status).toBe("pending");
  });

  it("marks a pending asset failed", async () => {
    const asset = await createPending();

    const failed = await markMediaAssetFailed(
      userA,
      workspaceA,
      String(asset._id),
    );

    expect(failed.status).toBe("failed");
    expect(failed.failureReason).toBe(
      "Image generation could not be completed.",
    );
  });

  it("does not allow a failed asset to become ready", async () => {
    const asset = await createPending();

    await markMediaAssetFailed(userA, workspaceA, String(asset._id));

    await expect(
      markMediaAssetReady(
        userA,
        workspaceA,
        String(asset._id),
        readyMetadata(),
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("does not allow a ready asset to become failed", async () => {
    const asset = await createPending();

    await markMediaAssetReady(
      userA,
      workspaceA,
      String(asset._id),
      readyMetadata(),
    );

    await expect(
      markMediaAssetFailed(userA, workspaceA, String(asset._id)),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("allows only one concurrent completion", async () => {
    const asset = await createPending();

    const outcomes = await Promise.allSettled([
      markMediaAssetReady(
        userA,
        workspaceA,
        String(asset._id),
        readyMetadata(),
      ),
      markMediaAssetFailed(userA, workspaceA, String(asset._id)),
    ]);

    expect(
      outcomes.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);

    expect(
      outcomes.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);

    const persisted = await MediaAsset.findById(asset._id);

    expect(["ready", "failed"]).toContain(persisted?.status);
  });

  it("enforces storage-key uniqueness in MongoDB", async () => {
    const first = await createPending();
    const second = await createPending();

    const metadata = readyMetadata();

    await markMediaAssetReady(userA, workspaceA, String(first._id), metadata);

    await expect(
      markMediaAssetReady(userA, workspaceA, String(second._id), metadata),
    ).rejects.toMatchObject({
      code: 11000,
    });

    const secondAfter = await MediaAsset.findById(second._id);

    expect(secondAfter?.status).toBe("pending");
  });

  it("rejects out-of-range listing limits", async () => {
    await expect(
      listWorkspaceMediaAssets(userA, workspaceA, 101),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
