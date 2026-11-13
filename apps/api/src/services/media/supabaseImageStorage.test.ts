import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

import {
  getImageStorageKey,
  uploadGeneratedImage,
  ImageStorageError,
  type ImageStorageBucket,
} from "./supabaseImageStorage.js";

import { validateGeneratedImage } from "./imageValidation.js";

const WORKSPACE_ID = "507f1f77bcf86cd799439011";
const ASSET_ID = "507f1f77bcf86cd799439022";

const STORAGE_KEY = getImageStorageKey(WORKSPACE_ID, ASSET_ID);

async function makeImage(): Promise<Buffer> {
  return sharp({
    create: {
      width: 128,
      height: 128,
      channels: 4,
      background: {
        r: 25,
        g: 80,
        b: 160,
        alpha: 1,
      },
    },
  })
    .png()
    .toBuffer();
}

function makeBucket() {
  const objects = new Map<string, Buffer>();

  const upload = vi.fn<ImageStorageBucket["upload"]>(
    async (path, body, options) => {
      if (objects.has(path) && !options.upsert) {
        return {
          error: {
            message: "Object already exists.",
          },
        };
      }

      objects.set(path, Buffer.from(body));

      return { error: null };
    },
  );

  const download = vi.fn<ImageStorageBucket["download"]>(async (path) => {
    const bytes = objects.get(path);

    if (!bytes) {
      return {
        data: null,
        error: {
          message: "Object not found.",
        },
      };
    }

    return {
      data: new Blob([Uint8Array.from(bytes)]),
      error: null,
    };
  });

  const remove = vi.fn<ImageStorageBucket["remove"]>(async (paths) => {
    for (const path of paths) {
      objects.delete(path);
    }

    return { error: null };
  });

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

describe("Private image storage integrity", () => {
  it("uploads, reads back, and verifies a PNG", async () => {
    const bytes = await makeImage();
    const expected = await validateGeneratedImage(bytes);
    const storage = makeBucket();

    const result = await uploadGeneratedImage(
      {
        workspaceId: WORKSPACE_ID,
        assetId: ASSET_ID,
        bytes,
      },
      storage.bucket,
    );

    expect(result).toEqual({
      storageKey: STORAGE_KEY,
      mimeType: "image/png",
      width: 128,
      height: 128,
      fileSize: expected.fileSize,
      sha256: expected.sha256,
    });

    expect(storage.upload).toHaveBeenCalledWith(
      STORAGE_KEY,
      expect.any(ArrayBuffer),
      {
        contentType: "image/png",
        cacheControl: "3600",
        upsert: false,
      },
    );

    expect(storage.download).toHaveBeenCalledWith(STORAGE_KEY);

    expect(storage.objects.get(STORAGE_KEY)).toEqual(expected.bytes);

    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("rejects corrupted stored bytes and cleans up", async () => {
    const bytes = await makeImage();
    const storage = makeBucket();

    storage.download.mockImplementationOnce(async () => ({
      data: new Blob([Uint8Array.from([1, 2, 3, 4])]),
      error: null,
    }));

    await expect(
      uploadGeneratedImage(
        {
          workspaceId: WORKSPACE_ID,
          assetId: ASSET_ID,
          bytes,
        },
        storage.bucket,
      ),
    ).rejects.toBeInstanceOf(ImageStorageError);

    expect(storage.remove).toHaveBeenCalledWith([STORAGE_KEY]);

    expect(storage.objects.has(STORAGE_KEY)).toBe(false);
  });

  it("does not remove an object after upload rejection", async () => {
    const bytes = await makeImage();
    const storage = makeBucket();

    const existing = Buffer.from("existing-object");

    storage.objects.set(STORAGE_KEY, existing);

    await expect(
      uploadGeneratedImage(
        {
          workspaceId: WORKSPACE_ID,
          assetId: ASSET_ID,
          bytes,
        },
        storage.bucket,
      ),
    ).rejects.toBeInstanceOf(ImageStorageError);

    expect(storage.download).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();

    expect(storage.objects.get(STORAGE_KEY)).toEqual(existing);
  });

  it("fails when read-back verification is unavailable", async () => {
    const bytes = await makeImage();
    const storage = makeBucket();

    storage.download.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Temporary storage failure.",
      },
    });

    await expect(
      uploadGeneratedImage(
        {
          workspaceId: WORKSPACE_ID,
          assetId: ASSET_ID,
          bytes,
        },
        storage.bucket,
      ),
    ).rejects.toBeInstanceOf(ImageStorageError);

    expect(storage.remove).toHaveBeenCalledWith([STORAGE_KEY]);
  });

  it("reports when cleanup cannot be confirmed", async () => {
    const bytes = await makeImage();
    const storage = makeBucket();

    storage.download.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Read-back failed.",
      },
    });

    storage.remove.mockResolvedValueOnce({
      error: {
        message: "Cleanup failed.",
      },
    });

    await expect(
      uploadGeneratedImage(
        {
          workspaceId: WORKSPACE_ID,
          assetId: ASSET_ID,
          bytes,
        },
        storage.bucket,
      ),
    ).rejects.toThrow(
      "Image verification failed and cleanup could not be confirmed.",
    );

    expect(storage.objects.has(STORAGE_KEY)).toBe(true);
  });

  it("rejects invalid storage identifiers", () => {
    expect(() => getImageStorageKey("../another-workspace", ASSET_ID)).toThrow(
      ImageStorageError,
    );
  });
});
