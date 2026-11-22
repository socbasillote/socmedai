// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAutomaticCrop } from "./automaticImageCrop";
import { apiFetch } from "@/lib/api";
import { getMediaLibraryItem } from "@/lib/mediaLibrary";
import { getWorkspaceImageUrl } from "@/lib/imageGeneration";
vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/mediaLibrary", () => ({ getMediaLibraryItem: vi.fn() }));
vi.mock("@/lib/imageGeneration", () => ({ getWorkspaceImageUrl: vi.fn() }));
const drawImage = vi.fn();
const bitmap = { width: 1000, height: 1000, close: vi.fn() };
beforeEach(() => {
  vi.mocked(getMediaLibraryItem).mockResolvedValue({ sourceWorkspaceId: "source-workspace" } as Awaited<ReturnType<typeof getMediaLibraryItem>>);
  vi.mocked(getWorkspaceImageUrl).mockResolvedValue({ assetId: "original", url: "https://example.test/original.png", expiresIn: 60 });
  vi.mocked(apiFetch).mockResolvedValue({ assetId: "cropped" });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, blob: async () => new Blob(["original"]) })));
  vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(callback => callback(new Blob(["cropped"], { type: "image/png" })));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
it.each([
  ["facebook", "square", 1080, 1080],
  ["instagram", "portrait", 1080, 1350],
  ["linkedin", "landscape", 1200, 630],
] as const)("exports the centered %s crop to its platform dimensions", async (platform, format, width, height) => {
  const result = await createAutomaticCrop("workspace", "original", platform);
  expect(result).toEqual({ assetId: "cropped", originalAssetId: "original", crop: { format, x: 50, y: 50, zoom: 1 } });
  const args = drawImage.mock.calls[0];
  expect(args.slice(-4)).toEqual([0, 0, width, height]);
  expect(apiFetch).toHaveBeenCalledWith("/api/ai/workspaces/workspace/upload-post-image", expect.objectContaining({ method: "POST", body: expect.any(File) }));
  expect(apiFetch).toHaveBeenCalledOnce();
  expect(getWorkspaceImageUrl).toHaveBeenCalledWith("source-workspace", "original", true);
  expect(bitmap.close).toHaveBeenCalledOnce();
});
it("releases the decoded image if uploading fails", async () => {
  vi.mocked(apiFetch).mockRejectedValueOnce(new Error("Upload unavailable"));
  await expect(createAutomaticCrop("workspace", "original", "instagram")).rejects.toThrow("Upload unavailable");
  expect(bitmap.close).toHaveBeenCalledOnce();
});
