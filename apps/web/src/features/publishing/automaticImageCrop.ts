import { apiFetch } from "@/lib/api";
import { getMediaLibraryItem } from "@/lib/mediaLibrary";
import { getWorkspaceImageUrl } from "@/lib/imageGeneration";
import type { PostPlatform } from "@/lib/posts";
import { cropFile, defaultCrop, drawImageCrop } from "./imageCrop";

export async function createAutomaticCrop(workspaceId: string, originalAssetId: string, platform: PostPlatform) {
  const source = await getMediaLibraryItem(originalAssetId);
  const signed = await getWorkspaceImageUrl(source.sourceWorkspaceId, originalAssetId, true);
  const response = await fetch(signed.url);
  if (!response.ok) throw new Error("Could not load the original image for cropping.");
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const crop = defaultCrop(platform);
    const canvas = document.createElement("canvas");
    drawImageCrop(canvas, bitmap, crop);
    const file = await cropFile(canvas, platform);
    const uploaded = await apiFetch<{ assetId: string }>(`/api/ai/workspaces/${workspaceId}/upload-post-image`, { method: "POST", headers: { "Content-Type": file.type }, body: file });
    // The persisted asset ID is sufficient to refresh its preview after reopening.
    return { assetId: uploaded.assetId, originalAssetId, crop };
  } finally { bitmap.close(); }
}
