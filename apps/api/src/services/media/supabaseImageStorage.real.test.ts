import mongoose from "mongoose";
import sharp from "sharp";

import { describe, expect, it } from "vitest";

import {
  getImageStorageKey,
  getPrivateImageBucket,
  uploadGeneratedImage,
} from "./supabaseImageStorage.js";

const runRealStorage = process.env.RUN_REAL_STORAGE_TESTS === "1";

describe.skipIf(!runRealStorage)("Real private Supabase Storage", () => {
  it("uploads, verifies, and cleans up a unique image", async () => {
    const workspaceId = new mongoose.Types.ObjectId().toString();

    const assetId = new mongoose.Types.ObjectId().toString();

    const key = getImageStorageKey(workspaceId, assetId);

    const bucket = getPrivateImageBucket();

    const bytes = await sharp({
      create: {
        width: 96,
        height: 96,
        channels: 3,
        background: "#7c3aed",
      },
    })
      .png()
      .toBuffer();

    try {
      const stored = await uploadGeneratedImage(
        {
          workspaceId,
          assetId,
          bytes,
        },
        bucket,
      );

      expect(stored.storageKey).toBe(key);
      expect(stored.mimeType).toBe("image/png");
      expect(stored.width).toBe(96);
      expect(stored.height).toBe(96);
      expect(stored.sha256).toMatch(/^[a-f0-9]{64}$/);

      const downloaded = await bucket.download(key);

      expect(downloaded.error).toBeNull();
      expect(downloaded.data).not.toBeNull();
    } finally {
      // This test exclusively owns a newly generated
      // random object key. Cleanup is safe even if the
      // upload response was ambiguous.
      const cleanup = await bucket.remove([key]);

      if (cleanup.error) {
        throw new Error("Temporary smoke-test object cleanup failed.");
      }
    }
  });
});
