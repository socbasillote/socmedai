import { createHash } from "node:crypto";
import mongoose from "mongoose";
import sharp from "sharp";

import { getWorkspaceLogoStorageKey } from "./workspaceLogoConfig.js";

import {
  getPrivateImageBucket,
  type ImageStorageBucket,
} from "./supabaseImageStorage.js";

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const MAX_LOGO_DIMENSION = 2048;
const MAX_LOGO_PIXELS = 4_000_000;

export class WorkspaceLogoStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceLogoStorageError";
  }
}

export type StoredWorkspaceLogo = {
  storageKey: string;
  sha256: string;
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function validateWorkspaceLogoKey(
  workspaceId: string,
  storageKey: string,
): void {
  if (!mongoose.isObjectIdOrHexString(workspaceId)) {
    throw new WorkspaceLogoStorageError("Invalid workspace identifier.");
  }

  const prefix = `workspaces/${workspaceId.toLowerCase()}/logos/`;

  if (
    !storageKey.startsWith(prefix) ||
    !/^[a-f0-9]{24}\.png$/.test(storageKey.slice(prefix.length))
  ) {
    throw new WorkspaceLogoStorageError("Invalid workspace logo storage key.");
  }
}

/**
 * Validate a raster logo and normalize it
 * into a single-frame PNG.
 */
export async function normalizeWorkspaceLogo(
  input: Uint8Array,
): Promise<Buffer> {
  if (
    !(input instanceof Uint8Array) ||
    input.byteLength === 0 ||
    input.byteLength > MAX_LOGO_BYTES
  ) {
    throw new WorkspaceLogoStorageError(
      "Logo must be between 1 byte and 5 MB.",
    );
  }

  try {
    const source = sharp(input, {
      failOn: "error",
      limitInputPixels: MAX_LOGO_PIXELS,
      animated: false,
    });

    const metadata = await source.metadata();

    if (
      !["png", "jpeg", "webp"].includes(metadata.format ?? "") ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > MAX_LOGO_DIMENSION ||
      metadata.height > MAX_LOGO_DIMENSION ||
      metadata.width * metadata.height > MAX_LOGO_PIXELS ||
      (metadata.pages ?? 1) !== 1
    ) {
      throw new WorkspaceLogoStorageError(
        "Unsupported logo format or dimensions.",
      );
    }

    const normalized = await sharp(input, {
      failOn: "error",
      limitInputPixels: MAX_LOGO_PIXELS,
      animated: false,
    })
      .rotate()
      .png()
      .toBuffer({ resolveWithObject: true });

    if (
      normalized.info.width > MAX_LOGO_DIMENSION ||
      normalized.info.height > MAX_LOGO_DIMENSION ||
      normalized.data.length > MAX_LOGO_BYTES
    ) {
      throw new WorkspaceLogoStorageError(
        "Normalized logo exceeds storage limits.",
      );
    }

    return normalized.data;
  } catch (error) {
    if (error instanceof WorkspaceLogoStorageError) {
      throw error;
    }

    throw new WorkspaceLogoStorageError("Logo could not be decoded.");
  }
}

/**
 * Trusted server-side operation.
 *
 * A future authenticated workspace service
 * must authorize the owner before calling this.
 *
 * Always create a new key; never overwrite
 * an existing logo version.
 */
export async function uploadWorkspaceLogo(
  input: {
    workspaceId: string;
    bytes: Uint8Array;
  },
  bucket: ImageStorageBucket = getPrivateImageBucket(),
): Promise<StoredWorkspaceLogo> {
  if (!mongoose.isObjectIdOrHexString(input.workspaceId)) {
    throw new WorkspaceLogoStorageError("Invalid workspace identifier.");
  }

  const normalized = await normalizeWorkspaceLogo(input.bytes);

  const logoId = new mongoose.Types.ObjectId().toHexString();

  const key = getWorkspaceLogoStorageKey(input.workspaceId, logoId);

  const expectedHash = sha256(normalized);

  try {
    const uploaded = await bucket.upload(
      key,
      Uint8Array.from(normalized).buffer,
      {
        contentType: "image/png",
        cacheControl: "3600",
        upsert: false,
      },
    );

    if (uploaded.error) {
      throw new Error("Upload rejected.");
    }

    // Verify actual stored bytes before returning
    // a reference to the new logo.
    const downloaded = await bucket.download(key);

    if (downloaded.error || !downloaded.data) {
      throw new Error("Read-back unavailable.");
    }

    const stored = Buffer.from(await downloaded.data.arrayBuffer());

    if (
      stored.length !== normalized.length ||
      sha256(stored) !== expectedHash
    ) {
      throw new Error("Read-back checksum mismatch.");
    }

    return {
      storageKey: key,
      sha256: expectedHash,
    };
  } catch {
    // Never assume a failed upload response means
    // the private object was not created.
    // Preserve ambiguous objects for investigation.
    throw new WorkspaceLogoStorageError(
      "Logo storage verification failed; " + "the operation requires review.",
    );
  }
}

/**
 * Retrieve only a logo belonging to the
 * specified workspace and matching the
 * persisted SHA-256 checksum.
 *
 * Never silently substitute the latest logo.
 */
export async function downloadVerifiedWorkspaceLogo(
  input: {
    workspaceId: string;
    storageKey: string;
    sha256: string;
  },
  bucket: ImageStorageBucket = getPrivateImageBucket(),
): Promise<Buffer> {
  validateWorkspaceLogoKey(input.workspaceId, input.storageKey);

  if (!/^[a-f0-9]{64}$/.test(input.sha256)) {
    throw new WorkspaceLogoStorageError("Invalid logo checksum.");
  }

  let stored: Buffer;

  try {
    const result = await bucket.download(input.storageKey);

    if (result.error || !result.data) {
      throw new Error("Logo unavailable.");
    }

    stored = Buffer.from(await result.data.arrayBuffer());
  } catch {
    throw new WorkspaceLogoStorageError(
      "Private workspace logo is unavailable.",
    );
  }

  if (
    stored.length === 0 ||
    stored.length > MAX_LOGO_BYTES ||
    sha256(stored) !== input.sha256
  ) {
    throw new WorkspaceLogoStorageError(
      "Workspace logo integrity verification failed.",
    );
  }

  return stored;
}
