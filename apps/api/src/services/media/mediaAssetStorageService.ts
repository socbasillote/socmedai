import type { AuthenticatedUser } from "../userProfileService.js";

import {
  getWorkspaceMediaAsset,
  markMediaAssetReady,
  MediaAssetServiceError,
} from "../mediaAssetService.js";

import {
  getImageStorageKey,
  getPrivateImageBucket,
  uploadGeneratedImage,
  type ImageStorageBucket,
  type StoredImage,
} from "./supabaseImageStorage.js";

import { validateGeneratedImage } from "./imageValidation.js";

export class MediaAssetStorageError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "MediaAssetStorageError";
  }
}

type AssetContext = {
  authUser: AuthenticatedUser;
  workspaceId: string;
  assetId: string;
};

type CompleteAssetInput = AssetContext & {
  bytes: Uint8Array;
};

/**
 * Reconcile a concurrent completion without
 * silently accepting a different storage object.
 */
async function resolveCompletionConflict(
  context: AssetContext,
  expectedKey: string,
) {
  const current = await getWorkspaceMediaAsset(
    context.authUser,
    context.workspaceId,
    context.assetId,
  );

  if (current.status === "ready" && current.storageKey === expectedKey) {
    return current;
  }

  throw new MediaAssetServiceError("Media asset is no longer pending.", 409);
}

async function finalizeVerifiedImage(
  context: AssetContext,
  image: StoredImage,
) {
  try {
    return await markMediaAssetReady(
      context.authUser,
      context.workspaceId,
      context.assetId,
      {
        storageKey: image.storageKey,
        mimeType: image.mimeType,
        width: image.width,
        height: image.height,
        fileSize: image.fileSize,
      },
    );
  } catch (error) {
    if (error instanceof MediaAssetServiceError && error.statusCode === 409) {
      return resolveCompletionConflict(context, image.storageKey);
    }

    // The uploaded object is deliberately retained
    // if MongoDB completion fails.
    //
    // A later reconciliation can recover it without
    // regenerating or re-uploading the image.
    throw error;
  }
}

/**
 * Complete a pending MediaAsset using trusted
 * server-generated image bytes.
 *
 * Not an HTTP controller.
 */
export async function completePendingMediaAsset(
  input: CompleteAssetInput,
  bucket: ImageStorageBucket = getPrivateImageBucket(),
) {
  const asset = await getWorkspaceMediaAsset(
    input.authUser,
    input.workspaceId,
    input.assetId,
  );

  if (asset.generationExecution) {
    throw new MediaAssetStorageError(
      "Claimed generations require claim-aware storage.",
      409,
    );
  }

  if (asset.status !== "pending") {
    throw new MediaAssetStorageError(
      "Only pending media assets can be completed.",
      409,
    );
  }

  // This function performs normalization, upload,
  // read-back verification, and integrity checking.
  //
  // A storage error leaves MongoDB pending because
  // an upload timeout can have an unknown outcome.
  const image = await uploadGeneratedImage(
    {
      workspaceId: input.workspaceId,
      assetId: input.assetId,
      bytes: input.bytes,
    },
    bucket,
  );

  return finalizeVerifiedImage(input, image);
}

/**
 * Recover an asset whose private object already
 * exists but whose MongoDB status is still pending.
 *
 * This function does not call the image provider
 * and does not upload or overwrite an object.
 */
export async function reconcileStoredMediaAsset(
  context: AssetContext,
  bucket: ImageStorageBucket = getPrivateImageBucket(),
) {
  const asset = await getWorkspaceMediaAsset(
    context.authUser,
    context.workspaceId,
    context.assetId,
  );

  const key = getImageStorageKey(context.workspaceId, context.assetId);

  if (asset.status === "ready") {
    if (asset.storageKey !== key) {
      throw new MediaAssetStorageError(
        "Media asset storage metadata is inconsistent.",
        409,
      );
    }

    return asset;
  }

  if (asset.generationExecution) {
    throw new MediaAssetStorageError(
      "Claimed generations require claim-aware storage.",
      409,
    );
  }

  if (asset.status !== "pending") {
    throw new MediaAssetStorageError(
      "Failed media assets cannot be reconciled.",
      409,
    );
  }

  let storedBytes: Buffer;

  try {
    const download = await bucket.download(key);

    if (download.error || !download.data) {
      throw new Error("Stored object unavailable");
    }

    storedBytes = Buffer.from(await download.data.arrayBuffer());
  } catch {
    throw new MediaAssetStorageError(
      "The stored image cannot be verified yet.",
      503,
    );
  }

  // Revalidate actual object bytes. The stored file
  // must already be in Storm's normalized PNG format.
  const image = await validateGeneratedImage(storedBytes);

  if (!storedBytes.equals(image.bytes)) {
    throw new MediaAssetStorageError(
      "The stored image does not match the required normalized format.",
      409,
    );
  }

  return finalizeVerifiedImage(context, {
    storageKey: key,
    mimeType: image.mimeType,
    width: image.width,
    height: image.height,
    fileSize: image.fileSize,
    sha256: image.sha256,
  });
}
