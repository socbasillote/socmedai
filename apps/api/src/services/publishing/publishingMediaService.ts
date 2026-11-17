import { createHash } from "node:crypto";
import sharp from "sharp";
import MediaAsset from "../../models/MediaAsset.js";
import type { AuthenticatedUser } from "../userProfileService.js";
import { validateDraftMediaAttachments } from "../media/validateDraftMediaAttachments.js";
import { getImageStorageKey, getPrivateImageBucket } from "../media/supabaseImageStorage.js";
import { MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS } from "../media/imageValidation.js";

/** Resolve only persisted, currently authorized assets. Never accept a URL from the caller. */
export async function loadPublishingImage(authUser: AuthenticatedUser, workspaceId: string, mediaIds: readonly string[]): Promise<Buffer | undefined> {
  if (mediaIds.length === 0) return undefined;
  if (mediaIds.length !== 1) throw new Error("Publishing supports one image per post.");
  const [id] = await validateDraftMediaAttachments({ authUser, destinationWorkspaceId: workspaceId, mediaIds });
  const asset = await MediaAsset.findById(id).select("_id workspaceId contentSha256 fileSize").lean();
  if (!asset) throw new Error("Image is unavailable.");
  const key = getImageStorageKey(String(asset.workspaceId), String(asset._id));
  const { data, error } = await getPrivateImageBucket().download(key);
  if (error || !data || data.size > MAX_IMAGE_BYTES || data.size !== asset.fileSize) throw new Error("Image download failed.");
  const bytes = Buffer.from(await data.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== asset.contentSha256) throw new Error("Image verification failed.");
  // Use a portable JPEG with bounded dimensions for both social platforms.
  const image = await sharp(bytes, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: "error" })
    .rotate().resize({ width: 4096, height: 4096, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer();
  if (image.length > 10 * 1024 * 1024) throw new Error("Image exceeds the publishing size limit.");
  return image;
}
