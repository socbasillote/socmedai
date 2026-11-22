// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PlatformImageCrop } from "./PlatformImageCrop";
import { getMediaLibraryItem } from "@/lib/mediaLibrary";
import { getWorkspaceImageUrl } from "@/lib/imageGeneration";
vi.mock("@/lib/mediaLibrary", () => ({ getMediaLibraryItem: vi.fn() }));
vi.mock("@/lib/imageGeneration", () => ({ getWorkspaceImageUrl: vi.fn() }));
const drawImage = vi.fn();
const bitmap = { width: 1000, height: 1000, close: vi.fn() };
beforeEach(() => {
  vi.mocked(getMediaLibraryItem).mockResolvedValue({ assetId: "original", sourceWorkspaceId: "source-workspace" } as Awaited<ReturnType<typeof getMediaLibraryItem>>);
  vi.mocked(getWorkspaceImageUrl).mockResolvedValue({ assetId: "original", url: "https://example.test/original.png", expiresIn: 60 });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, blob: async () => new Blob(["image"], { type: "image/png" }) })));
  vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(callback => callback(new Blob(["cropped pixels"], { type: "image/png" })));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
it("previews and exports the same framing from the original asset", async () => {
  const apply = vi.fn(async () => {});
  render(<PlatformImageCrop platform="instagram" sourceAssetId="original" disabled={false} onApply={apply} />);
  fireEvent.click(screen.getByRole("button", { name: "Adjust crop" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Apply crop" })).toBeEnabled());
  expect(getWorkspaceImageUrl).toHaveBeenCalledWith("source-workspace", "original", true);
  fireEvent.change(screen.getByRole("slider", { name: "Horizontal position" }), { target: { value: "100" } });
  expect(drawImage).toHaveBeenLastCalledWith(bitmap, 200, 0, 800, 1000, 0, 0, 1080, 1350);
  fireEvent.click(screen.getByRole("button", { name: "Apply crop" }));
  await waitFor(() => expect(apply).toHaveBeenCalledOnce());
  expect(apply).toHaveBeenCalledWith(expect.any(File), { format: "portrait", x: 100, y: 50, zoom: 1 }, "original");
  expect(drawImage).toHaveBeenLastCalledWith(bitmap, 200, 0, 800, 1000, 0, 0, 1080, 1350);
});
it("cancels preview adjustments without changing the attachment", async () => {
  const apply = vi.fn(async () => {});
  render(<PlatformImageCrop platform="linkedin" sourceAssetId="original" disabled={false} onApply={apply} />);
  fireEvent.click(screen.getByRole("button", { name: "Adjust crop" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Apply crop" })).toBeEnabled());
  fireEvent.change(screen.getByRole("slider", { name: "Zoom" }), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancel crop" }));
  expect(screen.queryByRole("region", { name: "linkedin crop preview" })).toBeNull();
  expect(apply).not.toHaveBeenCalled();
});
it("does not permit applying a crop if the original cannot be loaded", async () => {
  vi.mocked(getMediaLibraryItem).mockRejectedValueOnce(new Error("Original unavailable"));
  const apply = vi.fn(async () => {});
  render(<PlatformImageCrop platform="facebook" sourceAssetId="original" disabled={false} onApply={apply} />);
  fireEvent.click(screen.getByRole("button", { name: "Adjust crop" }));
  await screen.findByText("Original unavailable");
  expect(screen.getByRole("button", { name: "Apply crop" })).toBeDisabled();
  expect(apply).not.toHaveBeenCalled();
});
it("preserves the preview when saving fails so it can be retried", async () => {
  const apply = vi.fn().mockRejectedValueOnce(new Error("Upload failed"));
  render(<PlatformImageCrop platform="instagram" sourceAssetId="original" disabled={false} onApply={apply} />);
  fireEvent.click(screen.getByRole("button", { name: "Adjust crop" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Apply crop" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Apply crop" }));
  await screen.findByText("Upload failed");
  expect(screen.getByRole("button", { name: "Apply crop" })).toBeEnabled();
  expect(screen.getByRole("region", { name: "instagram crop preview" })).toBeTruthy();
});
