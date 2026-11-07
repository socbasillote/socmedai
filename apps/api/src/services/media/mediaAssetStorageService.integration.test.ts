import mongoose from "mongoose";
import sharp from "sharp";
import { MongoMemoryServer } from "mongodb-memory-server";

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import MediaAsset from "../../models/MediaAsset.js";
import UserProfile from "../../models/UserProfile.js";
import Workspace from "../../models/Workspace.js";

import type { AuthenticatedUser } from "../userProfileService.js";

import { createPendingMediaAsset } from "../mediaAssetService.js";

import {
  type ImageStorageBucket,
  getImageStorageKey,
} from "./supabaseImageStorage.js";

import {
  completePendingMediaAsset,
  reconcileStoredMediaAsset,
} from "./mediaAssetStorageService.js";

let mongo: MongoMemoryServer;

const userA = {
  id: "storage-user-a",
} as AuthenticatedUser;

const userB = {
  id: "storage-user-b",
} as AuthenticatedUser;

let workspaceA: string;
let workspaceB: string;

function fakeBucket() {
  const objects = new Map<string, Uint8Array>();

  const upload = vi.fn(
    async (
      key: string,
      body: ArrayBuffer,
    ): Promise<{ error: { message: string } | null }> => {
      if (objects.has(key)) {
        return {
          error: { message: "Already exists" },
        };
      }

      objects.set(key, new Uint8Array(body));
      return { error: null };
    },
  );

  const download = vi.fn(
    async (
      key: string,
    ): Promise<{
      data: Blob | null;
      error: { message: string } | null;
    }> => {
      const bytes = objects.get(key);

      if (!bytes) {
        return {
          data: null,
          error: { message: "Not found" },
        };
      }

      return {
        data: new Blob([Uint8Array.from(bytes).buffer as ArrayBuffer]),
        error: null,
      };
    },
  );

  const remove = vi.fn(
    async (keys: string[]): Promise<{ error: { message: string } | null }> => {
      for (const key of keys) {
        objects.delete(key);
      }

      return { error: null };
    },
  );

  const bucket: ImageStorageBucket = {
    upload,
    download,
    remove,
  };

  return {
    bucket,
    objects,
    upload,
    download,
    remove,
  };
}

async function sampleImage() {
  return sharp({
    create: {
      width: 128,
      height: 96,
      channels: 3,
      background: "#7c3aed",
    },
  })
    .png()
    .toBuffer();
}

async function createPending() {
  return createPendingMediaAsset(
    userA,
    workspaceA,
    {
      prompt: "An elegant product photo on a wooden table.",
      aspectRatio: "square",
    },
    {
      provider: "openai",
      model: "test-image-model",
    },
  );
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await MediaAsset.createIndexes();
});

beforeEach(async () => {
  await MediaAsset.deleteMany({});
  await Workspace.collection.deleteMany({});
  await UserProfile.collection.deleteMany({});

  const profileA = new mongoose.Types.ObjectId();
  const profileB = new mongoose.Types.ObjectId();

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

  const a = new mongoose.Types.ObjectId();
  const b = new mongoose.Types.ObjectId();

  await Workspace.collection.insertMany([
    {
      _id: a,
      ownerUserId: profileA,
      name: "Workspace A",
    },
    {
      _id: b,
      ownerUserId: profileB,
      name: "Workspace B",
    },
  ]);

  workspaceA = String(a);
  workspaceB = String(b);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

describe("MediaAsset storage lifecycle", () => {
  it("uploads, verifies, and marks an asset ready", async () => {
    const asset = await createPending();
    const storage = fakeBucket();

    const result = await completePendingMediaAsset(
      {
        authUser: userA,
        workspaceId: workspaceA,
        assetId: String(asset._id),
        bytes: await sampleImage(),
      },
      storage.bucket,
    );

    expect(result.status).toBe("ready");
    expect(result.width).toBe(128);
    expect(result.height).toBe(96);

    expect(storage.upload).toHaveBeenCalledOnce();
    expect(storage.download).toHaveBeenCalledOnce();

    const saved = await MediaAsset.findById(asset._id);

    expect(saved?.status).toBe("ready");
  });

  it("rejects another workspace before uploading", async () => {
    const asset = await createPending();
    const storage = fakeBucket();

    await expect(
      completePendingMediaAsset(
        {
          authUser: userB,
          workspaceId: workspaceB,
          assetId: String(asset._id),
          bytes: await sampleImage(),
        },
        storage.bucket,
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("does not upload an already completed asset", async () => {
    const asset = await createPending();
    const storage = fakeBucket();
    const bytes = await sampleImage();

    const input = {
      authUser: userA,
      workspaceId: workspaceA,
      assetId: String(asset._id),
      bytes,
    };

    await completePendingMediaAsset(input, storage.bucket);

    await expect(
      completePendingMediaAsset(input, storage.bucket),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(storage.upload).toHaveBeenCalledOnce();
  });

  it("leaves the asset pending when storage fails", async () => {
    const asset = await createPending();
    const storage = fakeBucket();

    storage.upload.mockImplementationOnce(async () => ({
      error: { message: "Storage unavailable" },
    }));

    await expect(
      completePendingMediaAsset(
        {
          authUser: userA,
          workspaceId: workspaceA,
          assetId: String(asset._id),
          bytes: await sampleImage(),
        },
        storage.bucket,
      ),
    ).rejects.toThrow();

    const saved = await MediaAsset.findById(asset._id);

    expect(saved?.status).toBe("pending");
  });

  it("recovers an uploaded object without re-uploading", async () => {
    const asset = await createPending();
    const storage = fakeBucket();

    const key = getImageStorageKey(workspaceA, String(asset._id));

    const bytes = await sampleImage();

    // Simulate an existing stored image whose
    // MongoDB completion did not happen.
    storage.objects.set(key, bytes);

    const result = await reconcileStoredMediaAsset(
      {
        authUser: userA,
        workspaceId: workspaceA,
        assetId: String(asset._id),
      },
      storage.bucket,
    );

    expect(result.status).toBe("ready");
    expect(storage.upload).not.toHaveBeenCalled();
    expect(storage.download).toHaveBeenCalledOnce();
  });

  it("does not mark a missing storage object ready", async () => {
    const asset = await createPending();
    const storage = fakeBucket();

    await expect(
      reconcileStoredMediaAsset(
        {
          authUser: userA,
          workspaceId: workspaceA,
          assetId: String(asset._id),
        },
        storage.bucket,
      ),
    ).rejects.toMatchObject({
      statusCode: 503,
    });

    const saved = await MediaAsset.findById(asset._id);

    expect(saved?.status).toBe("pending");
  });

  it("rejects cross-workspace reconciliation", async () => {
    const asset = await createPending();
    const storage = fakeBucket();

    await expect(
      reconcileStoredMediaAsset(
        {
          authUser: userB,
          workspaceId: workspaceB,
          assetId: String(asset._id),
        },
        storage.bucket,
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(storage.download).not.toHaveBeenCalled();
  });
});
