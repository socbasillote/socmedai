import { createHash } from "node:crypto";
import mongoose from "mongoose";
import ImageReference from "../../models/ImageReference.js";
import UserProfile from "../../models/UserProfile.js";
import Workspace from "../../models/Workspace.js";
import type { AuthenticatedUser } from "../userProfileService.js";
import { validateGeneratedImage, MAX_IMAGE_BYTES } from "./imageValidation.js";
import { getPrivateImageBucket, type ImageStorageBucket } from "./supabaseImageStorage.js";
import type { ImageProviderRequest } from "./providers/imageProvider.js";

export const MAX_REFERENCE_UPLOAD_BYTES = 10 * 1024 * 1024;
export class ImageReferenceError extends Error {
  constructor(message: string, public readonly statusCode: number) { super(message); }
}
export function referenceStorageKey(workspaceId: string, id: string) {
  if (!/^[a-f0-9]{24}$/i.test(workspaceId) || !/^[a-f0-9]{24}$/i.test(id)) throw new ImageReferenceError("Invalid reference image.", 400);
  return `workspaces/${workspaceId.toLowerCase()}/references/${id.toLowerCase()}.png`;
}
export async function uploadImageReference(authUser: AuthenticatedUser, workspaceId: string, bytes: Uint8Array,
  bucket: ImageStorageBucket = getPrivateImageBucket()) {
  if (!mongoose.isObjectIdOrHexString(workspaceId)) throw new ImageReferenceError("Workspace not found.", 404);
  const profile = await UserProfile.findOne({ supabaseUserId: authUser.id }).select("_id").lean();
  const workspace = profile && await Workspace.findOne({ _id: workspaceId, ownerUserId: profile._id }).select("_id").lean();
  if (!profile || !workspace) throw new ImageReferenceError("Workspace not found.", 404);
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > MAX_REFERENCE_UPLOAD_BYTES) throw new ImageReferenceError("Choose a JPG, PNG, or WebP photo up to 10 MB.", 400);
  let image;
  try { image = await validateGeneratedImage(bytes); }
  catch { throw new ImageReferenceError("This photo could not be read. Choose a JPG, PNG, or WebP image.", 400); }
  const id = new mongoose.Types.ObjectId();
  const key = referenceStorageKey(workspaceId, String(id));
  let uploaded = false;
  try {
    const result = await bucket.upload(key, Uint8Array.from(image.bytes).buffer, { contentType: "image/png", cacheControl: "3600", upsert: false });
    if (result.error) throw new Error("Upload failed");
    uploaded = true;
    const stored = await bucket.download(key);
    if (stored.error || !stored.data || stored.data.size > MAX_IMAGE_BYTES) throw new Error("Verification failed");
    const hash = createHash("sha256").update(Buffer.from(await stored.data.arrayBuffer())).digest("hex");
    if (hash !== image.sha256) throw new Error("Verification failed");
    await ImageReference.create({ _id: id, workspaceId: workspace._id, createdByUserId: profile._id,
      storageKey: key, sha256: image.sha256, width: image.width, height: image.height });
    return { referenceId: String(id), width: image.width, height: image.height };
  } catch {
    if (uploaded) await bucket.remove([key]).catch(() => undefined);
    throw new ImageReferenceError("Photo upload failed. Please try again.", 503);
  }
}
export type ReferenceSnapshot = { referenceId: string; storageKey: string; sha256: string; usage: "inspiration" | "edit" | "design" };
/** Read only a server-admitted storage snapshot, never a client URL. */
export async function loadReferenceImage(snapshot: ReferenceSnapshot | null | undefined, workspaceId: string,
  bucket: ImageStorageBucket): Promise<ImageProviderRequest["referenceImage"]> {
  if (!snapshot) return undefined;
  if (snapshot.storageKey !== referenceStorageKey(workspaceId, String(snapshot.referenceId))) throw new ImageReferenceError("Invalid reference storage.", 409);
  const stored = await bucket.download(snapshot.storageKey);
  if (stored.error || !stored.data || stored.data.size > MAX_IMAGE_BYTES) throw new ImageReferenceError("Reference photo is unavailable.", 409);
  const bytes = Buffer.from(await stored.data.arrayBuffer());
  const image = await validateGeneratedImage(bytes);
  if (image.sha256 !== snapshot.sha256) throw new ImageReferenceError("Reference photo verification failed.", 409);
  return { bytes: image.bytes, usage: snapshot.usage };
}
