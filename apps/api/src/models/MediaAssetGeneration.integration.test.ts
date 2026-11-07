import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";

import MediaAsset from "./MediaAsset.js";

let mongo: MongoMemoryServer;

const workspaceA = new mongoose.Types.ObjectId();

const workspaceB = new mongoose.Types.ObjectId();

const createdByUserId = new mongoose.Types.ObjectId();

const requestKey = "generation-request-0001";

function assetInput(
  workspaceId: mongoose.Types.ObjectId,
  idempotencyKey = requestKey,
) {
  return {
    workspaceId,
    createdByUserId,

    generation: {
      provider: "openai",
      model: "test-image-model",
      prompt: "A premium product image on a desk.",
      aspectRatio: "square",
    },

    idempotencyKey,
    requestFingerprint: "a".repeat(64),

    generationExecution: {
      phase: "reserved",
      attemptCount: 0,
    },
  };
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();

  await mongoose.connect(mongo.getUri());

  await MediaAsset.createIndexes();
});

beforeEach(async () => {
  await MediaAsset.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

describe("MediaAsset generation indexes", () => {
  it("rejects duplicate keys within a workspace", async () => {
    await MediaAsset.create(assetInput(workspaceA));

    await expect(
      MediaAsset.create(assetInput(workspaceA)),
    ).rejects.toMatchObject({
      code: 11000,
    });

    expect(await MediaAsset.countDocuments({})).toBe(1);
  });

  it("allows the same key in different workspaces", async () => {
    await MediaAsset.create(assetInput(workspaceA));

    await MediaAsset.create(assetInput(workspaceB));

    expect(await MediaAsset.countDocuments({})).toBe(2);
  });

  it("allows legacy assets without keys", async () => {
    const input = assetInput(workspaceA);

    const {
      idempotencyKey: _ignoredKey,
      requestFingerprint: _ignoredFingerprint,
      generationExecution: _ignoredExecution,
      ...legacyInput
    } = input;

    await MediaAsset.create(legacyInput);
    await MediaAsset.create(legacyInput);

    expect(await MediaAsset.countDocuments({})).toBe(2);
  });

  it("defines the recovery lookup index", async () => {
    const indexes = await MediaAsset.collection.indexes();

    expect(
      indexes.some(
        (index) =>
          index.key?.status === 1 &&
          index.key?.["generationExecution.phase"] === 1 &&
          index.key?.["generationExecution.leaseExpiresAt"] === 1,
      ),
    ).toBe(true);
  });
});
