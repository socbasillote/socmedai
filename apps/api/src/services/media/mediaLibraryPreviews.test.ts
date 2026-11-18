import { expect, it, vi } from "vitest";
import { signAuthorizedLibraryPreviews } from "./mediaLibraryPreviews.js";
const workspace = "507f1f77bcf86cd799439011";
const images = ["507f1f77bcf86cd799439012", "507f1f77bcf86cd799439013"].map((assetId) => ({ assetId, sourceWorkspaceId: workspace }));
it("signs all authorized images with one storage request and maps by canonical path", async () => {
  const createSignedUrls = vi.fn(async (paths: string[]) => ({ data: [ { path: paths[1], signedUrl: "second" }, { path: paths[0], signedUrl: "first" } ], error: null }));
  const result = await signAuthorizedLibraryPreviews(images, { createSignedUrls });
  expect(createSignedUrls).toHaveBeenCalledTimes(1);
  expect(createSignedUrls.mock.calls[0][0]).toEqual(images.map((image) => `workspaces/${workspace}/images/${image.assetId}.png`));
  expect(result.map((image) => image.previewUrl)).toEqual(["first", "second"]);
});
it("keeps metadata available when preview signing fails", async () => {
  const result = await signAuthorizedLibraryPreviews(images, { createSignedUrls: vi.fn().mockRejectedValue(new Error("offline")) });
  expect(result.map((image) => image.previewUrl)).toEqual([null, null]);
  expect(result[0].assetId).toBe(images[0].assetId);
});
