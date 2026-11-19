import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { env } from "../../config/env.js";
import { IMAGE_BUCKET } from "../media/supabaseImageStorage.js";
// This private, short-lived JPEG copy is the only URL sent to Meta. Source assets stay private.
export async function prepareInstagramMedia(image: Buffer) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Private image storage is unavailable.");
  const bytes = await sharp(image).resize(1080, 1080, { fit: "contain", background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer();
  if (bytes.length > 8 * 1024 * 1024) throw new Error("Instagram image is too large.");
  const bucket = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }).storage.from(IMAGE_BUCKET);
  const key = `publishing/instagram/${randomUUID()}.jpg`;
  const uploaded = await bucket.upload(key, bytes, { contentType: "image/jpeg", upsert: false, cacheControl: "0" });
  if (uploaded.error) throw new Error("Instagram image upload failed.");
  const cleanup = async () => {
    try { const result = await bucket.remove([key]); if (result.error) console.warn("[instagram] Temporary image cleanup failed", { key }); }
    catch { console.warn("[instagram] Temporary image cleanup failed", { key }); }
  };
  try {
    const signed = await bucket.createSignedUrl(key, 600);
    if (signed.error || !signed.data?.signedUrl || new URL(signed.data.signedUrl).protocol !== "https:") throw new Error("Instagram image URL is unavailable.");
    return { imageUrl: signed.data.signedUrl, cleanup };
  } catch (error) { await cleanup(); throw error; }
}
