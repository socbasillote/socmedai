import { apiFetch } from "@/lib/api";

export type MediaLibraryScope = "current" | "all";

export type MediaLibraryItem = {
  assetId: string;
  sourceWorkspaceId: string;
  sourceWorkspaceName: string;
  type: "image";
  mimeType: string;
  width: number;
  height: number;
  createdAt: string;
  previewUrl?: string | null;
};

export type MediaLibraryResponse = {
  scope: MediaLibraryScope;
  activeWorkspaceId: string;
  images: MediaLibraryItem[];
};

const OBJECT_ID_PATTERN = /^[a-fA-F0-9]{24}$/;

export async function getMediaLibrary(
  workspaceId: string,
  scope: MediaLibraryScope = "current",
  limit = 12,
): Promise<MediaLibraryResponse> {
  if (!OBJECT_ID_PATTERN.test(workspaceId)) {
    throw new Error("Select a valid workspace.");
  }

  if (scope !== "current" && scope !== "all") {
    throw new Error("Invalid Media Library scope.");
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 30) {
    throw new Error("Invalid Media Library page size.");
  }

  const query = new URLSearchParams({
    workspaceId,
    scope,
    limit: String(limit),
    includePreviews: "true",
  });

  return apiFetch<MediaLibraryResponse>(
    `/api/ai/media/library?${query.toString()}`,
  );
}

export async function getMediaLibraryItem(
  assetId: string,
  force = false,
): Promise<MediaLibraryItem> {
  if (!OBJECT_ID_PATTERN.test(assetId)) {
    throw new Error("Invalid media asset ID.");
  }

  const response = await apiFetch<{
    image: MediaLibraryItem;
  }>(`/api/ai/media/library/${encodeURIComponent(assetId)}`, force ? { cache: "no-store" } : {});

  return response.image;
}
