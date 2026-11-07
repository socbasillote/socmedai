import mongoose from "mongoose";
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

import {
  createPrivateImageAccessUrl,
  IMAGE_URL_EXPIRY_SECONDS,
  type ImageUrlSigner,
} from "./mediaImageAccessService.js";

import { getImageStorageKey } from "./supabaseImageStorage.js";

let mongo: MongoMemoryServer;

const owner = {
  id: "image-access-owner",
} as AuthenticatedUser;

const stranger = {
  id: "image-access-stranger",
} as AuthenticatedUser;

let workspaceId: string;
let profileId: mongoose.Types.ObjectId;

function fakeSigner() {
  const createSignedUrl = vi.fn(
    async (
      _path: string,
      _expiresIn: number,
    ): Promise<{
      data: { signedUrl: string } | null;
      error: { message: string } | null;
    }> => ({
      data: {
        signedUrl: "https://example.test/private-signed-image",
      },
      error: null,
    }),
  );

  return {
    signer: {
      createSignedUrl,
    } satisfies ImageUrlSigner,
    createSignedUrl,
  };
}

async function makeReadyAsset() {
  const assetId = new mongoose.Types.ObjectId();

  await MediaAsset.create({
    _id: assetId,
    workspaceId,
    createdByUserId: profileId,

    type: "image",
    source: "ai-generated",
    status: "ready",
    storageProvider: "supabase",

    storageKey: getImageStorageKey(workspaceId, String(assetId)),
    mimeType: "image/png",
    width: 1024,
    height: 1024,
    fileSize: 4096,

    contentSha256: "a".repeat(64),

    generation: {
      provider: "mock",
      model: "storm-mock-image-v1",
      prompt: "A premium professional product photograph.",
      aspectRatio: "square",
    },

    idempotencyKey: "image-access-test-request-0001",

    requestFingerprint: "b".repeat(64),

    generationExecution: {
      phase: "storage_pending",
      attemptCount: 1,
    },
  });

  return String(assetId);
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

  profileId = new mongoose.Types.ObjectId();

  const workspaceObjectId = new mongoose.Types.ObjectId();

  workspaceId = String(workspaceObjectId);

  await UserProfile.collection.insertMany([
    {
      _id: profileId,
      supabaseUserId: owner.id,
    },
    {
      _id: new mongoose.Types.ObjectId(),
      supabaseUserId: stranger.id,
    },
  ]);

  await Workspace.collection.insertOne({
    _id: workspaceObjectId,
    ownerUserId: profileId,
    name: "Private Image Test Workspace",
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

describe("Authenticated private image access", () => {
  it("signs a ready owned image for 60 seconds", async () => {
    const assetId = await makeReadyAsset();
    const mock = fakeSigner();

    const response = await createPrivateImageAccessUrl(
      owner,
      workspaceId,
      assetId,
      mock.signer,
    );

    expect(response).toEqual({
      assetId,
      url: "https://example.test/private-signed-image",
      expiresIn: 60,
    });

    expect(mock.createSignedUrl).toHaveBeenCalledWith(
      getImageStorageKey(workspaceId, assetId),
      IMAGE_URL_EXPIRY_SECONDS,
    );
  });

  it("rejects another user before signing", async () => {
    const assetId = await makeReadyAsset();
    const mock = fakeSigner();

    await expect(
      createPrivateImageAccessUrl(stranger, workspaceId, assetId, mock.signer),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(mock.createSignedUrl).not.toHaveBeenCalled();
  });

  it("rejects non-ready images", async () => {
    const assetId = await makeReadyAsset();
    const mock = fakeSigner();

    await MediaAsset.updateOne(
      { _id: assetId },
      { $set: { status: "pending" } },
    );

    await expect(
      createPrivateImageAccessUrl(owner, workspaceId, assetId, mock.signer),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(mock.createSignedUrl).not.toHaveBeenCalled();
  });

  it("rejects inconsistent storage paths", async () => {
    const assetId = await makeReadyAsset();
    const mock = fakeSigner();

    await MediaAsset.updateOne(
      { _id: assetId },
      {
        $set: {
          storageKey: "unexpected/private/object.png",
        },
      },
    );

    await expect(
      createPrivateImageAccessUrl(owner, workspaceId, assetId, mock.signer),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(mock.createSignedUrl).not.toHaveBeenCalled();
  });

  it("rejects missing media assets", async () => {
    const mock = fakeSigner();

    await expect(
      createPrivateImageAccessUrl(
        owner,
        workspaceId,
        String(new mongoose.Types.ObjectId()),
        mock.signer,
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(mock.createSignedUrl).not.toHaveBeenCalled();
  });

  it("handles Supabase signing failures safely", async () => {
    const assetId = await makeReadyAsset();
    const mock = fakeSigner();

    mock.createSignedUrl.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Internal storage credentials or signing failure",
      },
    });

    await expect(
      createPrivateImageAccessUrl(owner, workspaceId, assetId, mock.signer),
    ).rejects.toMatchObject({
      statusCode: 503,
    });
  });

  it("rejects legacy assets without idempotent metadata", async () => {
    const assetId = await makeReadyAsset();
    const mock = fakeSigner();

    await MediaAsset.collection.updateOne(
      {
        _id: new mongoose.Types.ObjectId(assetId),
      },
      {
        $unset: {
          idempotencyKey: "",
          requestFingerprint: "",
          generationExecution: "",
        },
      },
    );

    await expect(
      createPrivateImageAccessUrl(owner, workspaceId, assetId, mock.signer),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(mock.createSignedUrl).not.toHaveBeenCalled();
  });
});
