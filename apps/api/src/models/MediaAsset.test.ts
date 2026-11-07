import mongoose from "mongoose";

import { describe, expect, it } from "vitest";

import MediaAsset from "./MediaAsset.js";

const workspaceId = new mongoose.Types.ObjectId();
const createdByUserId = new mongoose.Types.ObjectId();

function createPendingAsset() {
  return new MediaAsset({
    workspaceId,
    createdByUserId,
    generation: {
      provider: "openai",
      model: "test-image-model",
      prompt: "A professional product photograph on a desk.",
      aspectRatio: "square",
    },
  });
}

function createReadyAsset() {
  const asset = createPendingAsset();

  asset.status = "ready";
  asset.storageKey = `workspaces/${workspaceId.toString()}/images/${new mongoose.Types.ObjectId().toString()}.png`;

  asset.mimeType = "image/png";
  asset.width = 1024;
  asset.height = 1024;
  asset.fileSize = 500_000;

  return asset;
}

describe("MediaAsset model", () => {
  it("creates a pending image by default", async () => {
    const asset = createPendingAsset();

    await expect(asset.validate()).resolves.toBeUndefined();

    expect(asset.status).toBe("pending");
    expect(asset.type).toBe("image");
    expect(asset.source).toBe("ai-generated");
    expect(asset.storageProvider).toBe("supabase");
  });

  it("requires workspace ownership", async () => {
    const asset = createPendingAsset();

    asset.set("workspaceId", undefined);

    await expect(asset.validate()).rejects.toThrow(/workspaceId/);
  });

  it("requires the creator", async () => {
    const asset = createPendingAsset();

    asset.set("createdByUserId", undefined);

    await expect(asset.validate()).rejects.toThrow(/createdByUserId/);
  });

  it("requires valid generation metadata", async () => {
    const asset = createPendingAsset();

    asset.set("generation.prompt", "Too short");

    await expect(asset.validate()).rejects.toThrow(/generation.prompt/);
  });

  it("rejects unsupported aspect ratios", async () => {
    const asset = createPendingAsset();

    asset.set("generation.aspectRatio", "ultrawide");

    await expect(asset.validate()).rejects.toThrow(/generation.aspectRatio/);
  });

  it("accepts a complete ready image", async () => {
    const asset = createReadyAsset();

    await expect(asset.validate()).resolves.toBeUndefined();

    expect(asset.status).toBe("ready");
    expect(asset.mimeType).toBe("image/png");
    expect(asset.fileSize).toBe(500_000);
  });

  it("rejects a ready image without a storage key", async () => {
    const asset = createReadyAsset();

    asset.storageKey = undefined;

    await expect(asset.validate()).rejects.toThrow(/storageKey/);
  });

  it("rejects a ready image with missing dimensions", async () => {
    const asset = createReadyAsset();

    asset.width = undefined;

    await expect(asset.validate()).rejects.toThrow(/width/);
  });

  it("rejects unsupported image MIME types", async () => {
    const asset = createReadyAsset();

    asset.set("mimeType", "image/svg+xml");

    await expect(asset.validate()).rejects.toThrow(/mimeType/);
  });

  it("rejects invalid file sizes", async () => {
    const asset = createReadyAsset();

    asset.fileSize = 25 * 1024 * 1024;

    await expect(asset.validate()).rejects.toThrow(/fileSize/);
  });

  it("supports a failed generation without storage metadata", async () => {
    const asset = createPendingAsset();

    asset.status = "failed";
    asset.failureReason = "The image provider could not complete the request.";

    await expect(asset.validate()).resolves.toBeUndefined();
  });

  it("uses a dedicated collection", () => {
    expect(MediaAsset.collection.name).toBe("media_assets");
  });

  it("defines workspace and storage indexes", () => {
    const indexes = MediaAsset.schema.indexes();

    expect(indexes).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          {
            workspaceId: 1,
            createdAt: -1,
            _id: -1,
          },
          expect.any(Object),
        ]),
        expect.arrayContaining([
          {
            workspaceId: 1,
            status: 1,
            createdAt: -1,
          },
          expect.any(Object),
        ]),
        expect.arrayContaining([
          { storageKey: 1 },
          expect.objectContaining({
            unique: true,
          }),
        ]),
      ]),
    );
  });
});
