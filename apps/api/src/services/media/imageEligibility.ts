import { getImageStorageKey } from "./supabaseImageStorage.js";

export type ImageEligibilityInput = {
  _id: unknown;
  workspaceId: unknown;

  type?: unknown;
  source?: unknown;
  status?: unknown;

  storageProvider?: unknown;
  storageKey?: unknown;
  mimeType?: unknown;

  width?: unknown;
  height?: unknown;
  fileSize?: unknown;

  idempotencyKey?: unknown;
  generationExecution?: unknown;
  contentSha256?: unknown;
};

export type ImageEligibilityResult =
  | {
      eligible: true;
    }
  | {
      eligible: false;
      reason:
        | "invalid-identity"
        | "invalid-status"
        | "invalid-storage"
        | "invalid-file-metadata"
        | "missing-generation-verification";
    };

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function isPositiveInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function evaluateImageEligibility(
  asset: ImageEligibilityInput,
): ImageEligibilityResult {
  const assetId = String(asset._id ?? "");
  const workspaceId = String(asset.workspaceId ?? "");

  if (
    !OBJECT_ID_PATTERN.test(assetId) ||
    !OBJECT_ID_PATTERN.test(workspaceId)
  ) {
    return {
      eligible: false,
      reason: "invalid-identity",
    };
  }

  if (
    asset.type !== "image" ||
    asset.source !== "ai-generated" ||
    asset.status !== "ready"
  ) {
    return {
      eligible: false,
      reason: "invalid-status",
    };
  }

  const expectedStorageKey = getImageStorageKey(workspaceId, assetId);

  if (
    asset.storageProvider !== "supabase" ||
    asset.storageKey !== expectedStorageKey ||
    asset.mimeType !== "image/png"
  ) {
    return {
      eligible: false,
      reason: "invalid-storage",
    };
  }

  if (
    !isPositiveInteger(asset.width) ||
    !isPositiveInteger(asset.height) ||
    !isPositiveInteger(asset.fileSize)
  ) {
    return {
      eligible: false,
      reason: "invalid-file-metadata",
    };
  }

  if (
    typeof asset.idempotencyKey !== "string" ||
    asset.idempotencyKey.trim().length === 0 ||
    !asset.generationExecution ||
    typeof asset.generationExecution !== "object" ||
    typeof asset.contentSha256 !== "string" ||
    !SHA256_PATTERN.test(asset.contentSha256)
  ) {
    return {
      eligible: false,
      reason: "missing-generation-verification",
    };
  }

  return {
    eligible: true,
  };
}

export function isPreviewReadyImage(asset: ImageEligibilityInput): boolean {
  return evaluateImageEligibility(asset).eligible;
}
