import type {
  ImageGenerationDetails,
  ImageHistoryItem,
} from "@/lib/imageGeneration";

/**
 * Apply fresh server status to an existing
 * gallery item.
 *
 * The server must return the same asset ID.
 * Other asset IDs are ignored.
 */
export function applyImageHistoryStatus(
  item: ImageHistoryItem,
  details: ImageGenerationDetails,
): ImageHistoryItem {
  if (item.assetId !== details.assetId) {
    return item;
  }

  const unchanged =
    item.status === details.status &&
    item.state === details.state &&
    item.updatedAt === details.updatedAt &&
    item.image?.width === details.image?.width &&
    item.image?.height === details.image?.height &&
    item.image?.mimeType === details.image?.mimeType;

  if (unchanged) {
    return item;
  }

  return {
    ...item,
    status: details.status,
    state: details.state,
    updatedAt: details.updatedAt,

    ...(details.image
      ? {
          image: {
            width: details.image.width,
            height: details.image.height,
            mimeType: details.image.mimeType,
          },
        }
      : {}),
  };
}

export function isImageStillProcessing(item: ImageHistoryItem): boolean {
  return item.status === "pending" && item.state === "processing";
}
