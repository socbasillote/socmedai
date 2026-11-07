import mongoose from "mongoose";

import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import MediaAsset from "./MediaAsset.js";

const workspaceId = new mongoose.Types.ObjectId();
const createdByUserId = new mongoose.Types.ObjectId();

const idempotencyKey = "storm-generation-request-0001";

const fingerprint = "a".repeat(64);

function newAsset() {
  return new MediaAsset({
    workspaceId,
    createdByUserId,
    generation: {
      provider: "openai",
      model: "test-image-model",
      prompt: "A premium product photo on a wooden desk.",
      aspectRatio: "square",
    },
  });
}

function withOperation() {
  const asset = newAsset();

  asset.set({
    idempotencyKey,
    requestFingerprint: fingerprint,
    generationExecution: {
      phase: "reserved",
      attemptCount: 0,
    },
  });

  return asset;
}

describe("MediaAsset generation metadata", () => {
  it("accepts a reserved operation", async () => {
    const asset = withOperation();

    await expect(asset.validate()).resolves.toBeUndefined();

    expect(asset.generationExecution.phase).toBe("reserved");
  });

  it("preserves legacy assets without operation metadata", async () => {
    const asset = newAsset();

    await expect(asset.validate()).resolves.toBeUndefined();

    expect(asset.generationExecution).toBeUndefined();
  });

  it("rejects incomplete idempotency metadata", async () => {
    const asset = newAsset();

    asset.set("idempotencyKey", idempotencyKey);

    await expect(asset.validate()).rejects.toThrow(/generationExecution/);
  });

  it("rejects invalid request fingerprints", async () => {
    const asset = withOperation();

    asset.set("requestFingerprint", "not-a-sha256-value");

    await expect(asset.validate()).rejects.toThrow(/requestFingerprint/);
  });

  it("rejects a claimed operation without a lease", async () => {
    const asset = withOperation();

    asset.set("generationExecution.phase", "claimed");

    await expect(asset.validate()).rejects.toThrow(/generationExecution/);
  });

  it("accepts a claimed operation with token and lease", async () => {
    const asset = withOperation();

    asset.set("generationExecution", {
      phase: "claimed",
      claimToken: randomUUID(),
      leaseExpiresAt: new Date(Date.now() + 60_000),
      attemptCount: 1,
    });

    await expect(asset.validate()).resolves.toBeUndefined();
  });

  it("requires providerStartedAt for provider_started", async () => {
    const asset = withOperation();

    asset.set("generationExecution.phase", "provider_started");

    await expect(asset.validate()).rejects.toThrow(/providerStartedAt/);
  });

  it("accepts a valid content SHA-256", async () => {
    const asset = withOperation();

    asset.set("contentSha256", "b".repeat(64));

    await expect(asset.validate()).resolves.toBeUndefined();
  });

  it("rejects invalid content SHA-256", async () => {
    const asset = withOperation();

    asset.set("contentSha256", "invalid");

    await expect(asset.validate()).rejects.toThrow(/contentSha256/);
  });

  it("defines the unique idempotency index", () => {
    const indexes = MediaAsset.schema.indexes();

    expect(indexes).toEqual(
      expect.arrayContaining([
        [
          {
            workspaceId: 1,
            idempotencyKey: 1,
          },
          expect.objectContaining({
            unique: true,
            partialFilterExpression: {
              idempotencyKey: {
                $type: "string",
              },
            },
          }),
        ],
      ]),
    );
  });
});
