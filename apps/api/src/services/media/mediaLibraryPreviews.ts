import { createClient } from "@supabase/supabase-js";
import { env } from "../../config/env.js";
import { getImageStorageKey, IMAGE_BUCKET } from "./supabaseImageStorage.js";

export type LibraryPreviewItem = { assetId: string; sourceWorkspaceId: string };
type BatchSigner = { createSignedUrls(paths: string[], expiresIn: number): Promise<{ data: { path?: string | null; signedUrl?: string | null; error?: string | null }[] | null; error: unknown }> };

/** Call only with the output of listAuthorizedMediaLibrary, never request-body IDs. */
export async function signAuthorizedLibraryPreviews<T extends LibraryPreviewItem>(images: T[], signer?: BatchSigner) {
  if (!images.length) return [];
  const paths = images.map((image) => getImageStorageKey(image.sourceWorkspaceId, image.assetId));
  let signed: Awaited<ReturnType<BatchSigner["createSignedUrls"]>>;
  try {
    if (!signer) {
      if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Storage unavailable");
      signer = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      }).storage.from(IMAGE_BUCKET);
    }
    signed = await signer!.createSignedUrls(paths, 60);
  } catch {
    signed = { data: null, error: true };
  }
  const urls = new Map((signed.error ? [] : signed.data ?? []).map((item) => [item.path, item.error ? null : item.signedUrl]));
  return images.map((image, index) => ({ ...image, previewUrl: urls.get(paths[index]) ?? null }));
}
