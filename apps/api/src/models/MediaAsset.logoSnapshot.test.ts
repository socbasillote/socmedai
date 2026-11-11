import { describe, expect, it } from "vitest";
import mongoose from "mongoose";

import MediaAsset from "./MediaAsset.js";

const workspaceId = "6aeba54a3fe7bf29e916b3f1";

const ownerId = "6acf400f0cd983f0ce6abe49";

const logoId = "6af31be35bba81eee2f1be9b";

const validSnapshot = {
  enabled: true,
  logo: {
    storageKey: `workspaces/${workspaceId}/logos/${logoId}.png`,
    sha256: "a".repeat(64),
  },
  position: "bottom-right",
  sizePercent: 20,
  opacity: 0.8,
};

function createAsset(snapshot?: unknown) {
  return new MediaAsset({
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    createdByUserId: new mongoose.Types.ObjectId(ownerId),
    type: "image",
    source: "ai-generated",
    status: "pending",
    storageProvider: "supabase",
    generation: {
      provider: "mock",
      model: "storm-mock-image-v1",
      prompt: "A test image for workspace branding.",
      aspectRatio: "square",
    },
    ...(snapshot === undefined ? {} : { logoOverlaySnapshot: snapshot }),
  });
}

describe("MediaAsset logo snapshot", () => {
  it("accepts a valid branded snapshot", async () => {
    const asset = createAsset(validSnapshot);

    await expect(asset.validate()).resolves.toBeUndefined();
  });

  it("accepts a disabled snapshot without a logo", async () => {
    const asset = createAsset({
      ...validSnapshot,
      enabled: false,
      logo: null,
    });

    await expect(asset.validate()).resolves.toBeUndefined();
  });

  it("accepts legacy assets without a snapshot", async () => {
    const asset = createAsset();

    await expect(asset.validate()).resolves.toBeUndefined();
  });

  it("rejects enabled branding without a logo", async () => {
    const asset = createAsset({
      ...validSnapshot,
      logo: null,
    });

    await expect(asset.validate()).rejects.toThrow();
  });

  it("rejects a logo from another workspace", async () => {
    const asset = createAsset({
      ...validSnapshot,
      logo: {
        ...validSnapshot.logo,
        storageKey:
          "workspaces/6af27c92174f7f0f7959491c/" + `logos/${logoId}.png`,
      },
    });

    await expect(asset.validate()).rejects.toThrow();
  });

  it("rejects malformed snapshot checksum", async () => {
    const asset = createAsset({
      ...validSnapshot,
      logo: {
        ...validSnapshot.logo,
        sha256: "invalid",
      },
    });

    await expect(asset.validate()).rejects.toThrow();
  });

  it("rejects invalid logo size", async () => {
    const asset = createAsset({
      ...validSnapshot,
      sizePercent: 90,
    });

    await expect(asset.validate()).rejects.toThrow();
  });

  it("rejects invalid opacity", async () => {
    const asset = createAsset({
      ...validSnapshot,
      opacity: 2,
    });

    await expect(asset.validate()).rejects.toThrow();
  });
});
