import { createHash } from "node:crypto";
import sharp from "sharp";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), findById: vi.fn(), download: vi.fn() }));
vi.mock("../media/validateDraftMediaAttachments.js", () => ({ validateDraftMediaAttachments: mocks.authorize }));
vi.mock("../../models/MediaAsset.js", () => ({ default: { findById: mocks.findById } }));
vi.mock("../media/supabaseImageStorage.js", () => ({
  getImageStorageKey: (workspace: string, asset: string) => `workspaces/${workspace}/images/${asset}.png`,
  getPrivateImageBucket: () => ({ download: mocks.download }),
}));
import { loadPublishingImage } from "./publishingMediaService.js";
const auth = { id: "owner", email: null };
let png: Buffer;
beforeEach(async () => {
  vi.resetAllMocks();
  png = await sharp({ create: { width: 16, height: 16, channels: 4, background: "red" } }).png().toBuffer();
  mocks.authorize.mockResolvedValue(["asset"]);
  mocks.findById.mockReturnValue({ select: () => ({ lean: async () => ({ _id: "asset", workspaceId: "source", fileSize: png.length, contentSha256: createHash("sha256").update(png).digest("hex") }) }) });
  mocks.download.mockResolvedValue({ data: new Blob([Uint8Array.from(png).buffer]), error: null });
});
it("authorizes source ownership and downloads the canonical source key, including another owned workspace", async () => {
  const result = await loadPublishingImage(auth, "destination", ["asset"]);
  expect(mocks.authorize).toHaveBeenCalledWith({ authUser: auth, destinationWorkspaceId: "destination", mediaIds: ["asset"] });
  expect(mocks.download).toHaveBeenCalledWith("workspaces/source/images/asset.png");
  expect((await sharp(result).metadata()).format).toBe("jpeg");
});
it("never downloads unauthorized images", async () => {
  mocks.authorize.mockRejectedValue(new Error("Unauthorized"));
  await expect(loadPublishingImage(auth, "destination", ["asset"])).rejects.toThrow();
  expect(mocks.download).not.toHaveBeenCalled();
});
it("rejects tampered storage bytes", async () => {
  mocks.download.mockResolvedValue({ data: new Blob([new Uint8Array(png.length).buffer]), error: null });
  await expect(loadPublishingImage(auth, "destination", ["asset"])).rejects.toThrow("verification");
});
it("preserves text posts and rejects multiple attachments", async () => {
  expect(await loadPublishingImage(auth, "destination", [])).toBeUndefined();
  await expect(loadPublishingImage(auth, "destination", ["a", "b"])).rejects.toThrow("one image");
  expect(mocks.download).not.toHaveBeenCalled();
});
