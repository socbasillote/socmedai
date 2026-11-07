import mongoose from "mongoose";
import sharp from "sharp";

import { describe, expect, it, vi } from "vitest";

import {
  getImageStorageKey,
  uploadGeneratedImage,
  removeStoredImage,
  type ImageStorageBucket,
} from "./supabaseImageStorage.js";

const workspaceId = new mongoose.Types.ObjectId().toString();

const assetId = new mongoose.Types.ObjectId().toString();

async function samplePng() {
  return sharp({
    create: {
      width: 120,
      height: 80,
      channels: 3,
      background: "#9333ea",
    },
  })
    .png()
    .toBuffer();
}

function fakeBucket() {
  const objects = new Map<string, Uint8Array>();

  const upload = vi.fn(
    async (
      path: string,
      body: ArrayBuffer,
      _options: {
        contentType: "image/png";
        cacheControl: string;
        upsert: false;
      },
    ) => {
      if (objects.has(path)) {
        return {
          error: { message: "Object already exists" },
        };
      }

      objects.set(path, new Uint8Array(body));

      return { error: null };
    },
  );

  const download = vi.fn(async (path: string) => {
    const object = objects.get(path);

    if (!object) {
      return {
        data: null,
        error: { message: "Object not found" },
      };
    }

    return {
      data: new Blob([Uint8Array.from(object).buffer as ArrayBuffer]),
      error: null,
    };
  });

  const remove = vi.fn(
    async (
      paths: string[],
    ): Promise<{
      error: { message: string } | null;
    }> => {
      for (const path of paths) {
        objects.delete(path);
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

function request(bytes: Uint8Array) {
  return { workspaceId, assetId, bytes };
}

describe("supabaseImageStorage", () => {
  it("creates a workspace-scoped object key", () => {
    expect(getImageStorageKey(workspaceId, assetId)).toBe(
      `workspaces/${workspaceId}/images/${assetId}.png`,
    );
  });

  it("rejects invalid storage identifiers", () => {
    expect(() => getImageStorageKey("../another-workspace", assetId)).toThrow();
  });

  it("uploads and verifies an image", async () => {
    const storage = fakeBucket();

    const result = await uploadGeneratedImage(
      request(await samplePng()),
      storage.bucket,
    );

    expect(result.width).toBe(120);
    expect(result.height).toBe(80);
    expect(result.mimeType).toBe("image/png");
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);

    expect(storage.objects.has(result.storageKey)).toBe(true);

    expect(storage.download).toHaveBeenCalledOnce();

    expect(storage.upload).toHaveBeenCalledWith(
      result.storageKey,
      expect.any(ArrayBuffer),
      {
        contentType: "image/png",
        cacheControl: "3600",
        upsert: false,
      },
    );
  });

  it("rejects duplicate uploads without deleting the original", async () => {
    const storage = fakeBucket();
    const bytes = await samplePng();

    await uploadGeneratedImage(request(bytes), storage.bucket);

    await expect(
      uploadGeneratedImage(request(bytes), storage.bucket),
    ).rejects.toThrow();

    expect(storage.objects.size).toBe(1);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("cleans up an image when verification fails", async () => {
    const storage = fakeBucket();

    storage.download.mockImplementationOnce(async () => ({
      data: new Blob([
        Uint8Array.from(Buffer.from("corrupted")).buffer as ArrayBuffer,
      ]),
      error: null,
    }));

    await expect(
      uploadGeneratedImage(request(await samplePng()), storage.bucket),
    ).rejects.toThrow();

    expect(storage.remove).toHaveBeenCalledOnce();
    expect(storage.objects.size).toBe(0);
  });

  it("reports cleanup uncertainty", async () => {
    const storage = fakeBucket();

    storage.download.mockImplementationOnce(async () => ({
      data: null,
      error: { message: "Read failed" },
    }));

    storage.remove.mockImplementationOnce(async () => ({
      error: { message: "Cleanup unavailable" },
    }));

    await expect(
      uploadGeneratedImage(request(await samplePng()), storage.bucket),
    ).rejects.toThrow("cleanup could not be confirmed");
  });

  it("removes only the specified storage key", async () => {
    const storage = fakeBucket();
    const firstBytes = await samplePng();

    await uploadGeneratedImage(request(firstBytes), storage.bucket);

    const secondId = new mongoose.Types.ObjectId().toString();

    await uploadGeneratedImage(
      { workspaceId, assetId: secondId, bytes: firstBytes },
      storage.bucket,
    );

    await removeStoredImage(workspaceId, assetId, storage.bucket);

    expect(storage.objects.has(getImageStorageKey(workspaceId, assetId))).toBe(
      false,
    );

    expect(storage.objects.has(getImageStorageKey(workspaceId, secondId))).toBe(
      true,
    );
  });
});
