import { createClient } from "@supabase/supabase-js";

import { env } from "../../config/env.js";

import type { AuthenticatedUser } from "../userProfileService.js";

import { getWorkspaceMediaAsset } from "../mediaAssetService.js";

import { getImageStorageKey, IMAGE_BUCKET } from "./supabaseImageStorage.js";

export const IMAGE_URL_EXPIRY_SECONDS = 60;

export class MediaImageAccessError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "MediaImageAccessError";
  }
}

export type ImageUrlSigner = {
  createSignedUrl(
    path: string,
    expiresIn: number,
  ): Promise<{
    data: { signedUrl: string } | null;
    error: { message: string } | null;
  }>;
};

/**
 * Server-only Supabase service-role client.
 *
 * No Supabase credentials are returned
 * to the browser.
 */
function getImageUrlSigner(): ImageUrlSigner {
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new MediaImageAccessError(
      "Private image access is unavailable.",
      503,
    );
  }

  const supabase = createClient(env.SUPABASE_URL, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabase.storage.from(IMAGE_BUCKET);
}

export async function createPrivateImageAccessUrl(
  authUser: AuthenticatedUser,
  workspaceId: string,
  assetId: string,
  signer?: ImageUrlSigner,
) {
  // Reuse the existing workspace ownership
  // and asset authorization checks.
  const asset = await getWorkspaceMediaAsset(authUser, workspaceId, assetId);

  if (
    asset.status !== "ready" ||
    asset.type !== "image" ||
    asset.source !== "ai-generated" ||
    !asset.idempotencyKey ||
    !asset.generationExecution
  ) {
    throw new MediaImageAccessError("Image is not available.", 409);
  }

  const expectedKey = getImageStorageKey(workspaceId, String(asset._id));

  if (
    asset.storageProvider !== "supabase" ||
    asset.storageKey !== expectedKey ||
    asset.mimeType !== "image/png" ||
    !asset.contentSha256 ||
    !/^[a-f0-9]{64}$/.test(asset.contentSha256)
  ) {
    throw new MediaImageAccessError(
      "Image storage metadata is inconsistent.",
      409,
    );
  }

  const imageSigner = signer ?? getImageUrlSigner();

  let signed: Awaited<ReturnType<ImageUrlSigner["createSignedUrl"]>>;

  try {
    signed = await imageSigner.createSignedUrl(
      expectedKey,
      IMAGE_URL_EXPIRY_SECONDS,
    );
  } catch {
    throw new MediaImageAccessError(
      "Private image access is temporarily unavailable.",
      503,
    );
  }

  if (signed.error || !signed.data?.signedUrl) {
    throw new MediaImageAccessError(
      "Private image access is temporarily unavailable.",
      503,
    );
  }

  // Never include the storage key,
  // service-role token, or checksum here.
  return {
    assetId: String(asset._id),
    url: signed.data.signedUrl,
    expiresIn: IMAGE_URL_EXPIRY_SECONDS,
  };
}
