import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import mongoose from "mongoose";

import { env } from "../../config/env.js";

import {
  validateGeneratedImage,
  type ValidatedImage,
} from "./imageValidation.js";

export const IMAGE_BUCKET = "storm-media";

type StorageErrorResult = {
  error: { message: string } | null;
};

export type ImageStorageBucket = {
  upload(
    path: string,
    body: ArrayBuffer,
    options: {
      contentType: "image/png";
      cacheControl: string;
      upsert: false;
    },
  ): Promise<StorageErrorResult>;

  download(path: string): Promise<{
    data: Blob | null;
    error: { message: string } | null;
  }>;

  remove(paths: string[]): Promise<StorageErrorResult>;
};

export class ImageStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageStorageError";
  }
}

export function getPrivateImageBucket(): ImageStorageBucket {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new ImageStorageError("Private media storage is not configured.");
  }

  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return client.storage.from(IMAGE_BUCKET);
}

/**
 * Construct keys from trusted MongoDB IDs only.
 * Never use a prompt, filename, or URL as a key.
 */
export function getImageStorageKey(
  workspaceId: string,
  assetId: string,
): string {
  if (
    !mongoose.isObjectIdOrHexString(workspaceId) ||
    !mongoose.isObjectIdOrHexString(assetId)
  ) {
    throw new ImageStorageError("Invalid image storage identifiers.");
  }

  return (
    `workspaces/${workspaceId.toLowerCase()}/` +
    `images/${assetId.toLowerCase()}.png`
  );
}

export type StoredImage = {
  storageKey: string;
  mimeType: "image/png";
  width: number;
  height: number;
  fileSize: number;
  sha256: string;
};

/**
 * Server-only upload.
 *
 * Workspace authorization must occur in the
 * calling MediaAsset service before invoking
 * this function.
 */
export async function uploadGeneratedImage(
  input: {
    workspaceId: string;
    assetId: string;
    bytes: Uint8Array;
  },
  bucket: ImageStorageBucket = getPrivateImageBucket(),
): Promise<StoredImage> {
  const key = getImageStorageKey(input.workspaceId, input.assetId);

  const image: ValidatedImage = await validateGeneratedImage(input.bytes);

  const body = Uint8Array.from(image.bytes).buffer;

  let uploaded = false;

  try {
    const uploadResult = await bucket.upload(key, body, {
      contentType: image.mimeType,
      cacheControl: "3600",
      upsert: false,
    });

    if (uploadResult.error) {
      throw new ImageStorageError("Private image upload failed.");
    }

    uploaded = true;

    // Read back the stored object to verify
    // what Supabase actually persisted.
    const downloadResult = await bucket.download(key);

    if (downloadResult.error || !downloadResult.data) {
      throw new ImageStorageError("Stored image verification failed.");
    }

    const downloaded = Buffer.from(await downloadResult.data.arrayBuffer());

    const downloadedHash = createHash("sha256")
      .update(downloaded)
      .digest("hex");

    if (
      downloaded.length !== image.fileSize ||
      downloadedHash !== image.sha256
    ) {
      throw new ImageStorageError(
        "Stored image integrity verification failed.",
      );
    }

    return {
      storageKey: key,
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
      fileSize: image.fileSize,
      sha256: image.sha256,
    };
  } catch {
    if (uploaded) {
      // Only clean up an object successfully
      // uploaded by this invocation.
      let cleanupConfirmed = false;

      try {
        const cleanup = await bucket.remove([key]);
        cleanupConfirmed = !cleanup.error;
      } catch {
        cleanupConfirmed = false;
      }

      if (!cleanupConfirmed) {
        throw new ImageStorageError(
          "Image verification failed and cleanup could not be confirmed.",
        );
      }
    }

    throw new ImageStorageError("Image could not be safely stored.");
  }
}

/**
 * Internal cleanup helper.
 *
 * The caller must verify ownership and must
 * not delete assets referenced by posts.
 */
export async function removeStoredImage(
  workspaceId: string,
  assetId: string,
  bucket: ImageStorageBucket = getPrivateImageBucket(),
): Promise<void> {
  const key = getImageStorageKey(workspaceId, assetId);

  const result = await bucket.remove([key]);

  if (result.error) {
    throw new ImageStorageError("Image cleanup failed.");
  }
}
