import { createAutomaticCrop } from "@/features/publishing/automaticImageCrop";
import { defaultCrop } from "@/features/publishing/imageCrop";
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import type { PlatformImageCrop } from "@/features/publishing/components/PlatformImageCrop";
import { AIPostFlow } from "./AIPostFlow";
import { apiFetch } from "@/lib/api";
import { generateCaption } from "@/lib/aiContent";
import { createPost, validatePostBatch } from "@/lib/posts";
import { generateWorkspaceImage, getWorkspaceImageStatus, getWorkspaceImageUrl } from "@/lib/imageGeneration";
import { readAIReviewBatch, writeAIReviewBatch } from "@/features/posts/lib/aiReviewBatch";
vi.mock("@/lib/api", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/api")>(), apiFetch: vi.fn() }));
vi.mock("@/features/publishing/automaticImageCrop", () => ({ createAutomaticCrop: vi.fn() }));
vi.mock("@/lib/aiContent", () => ({ generateCaption: vi.fn() }));
vi.mock("@/lib/posts", () => ({ createPost: vi.fn(), validatePostBatch: vi.fn() }));
vi.mock("@/lib/mediaLibrary", () => ({ getMediaLibraryItem: vi.fn(async (id: string) => ({ assetId: id, sourceWorkspaceId: "507f1f77bcf86cd799439011" })) }));
vi.mock("@/lib/imageGeneration", () => ({ generateWorkspaceImage: vi.fn(), getWorkspaceImageStatus: vi.fn(), getWorkspaceImageUrl: vi.fn(), uploadWorkspaceImageReference: vi.fn() }));
vi.mock("@/features/publishing/components/MediaLibraryPicker", () => ({ MediaLibraryPicker: () => null }));
vi.mock("@/features/publishing/components/PlatformImageCrop", () => ({ PlatformImageCrop: (props: ComponentProps<typeof PlatformImageCrop>) => <><button type="button" disabled={props.disabled} onClick={() => void props.onApply(new File(["pixels"], "crop.png", { type: "image/png" }), { format: "portrait", x: 75, y: 50, zoom: 1.2 }, props.sourceAssetId)}>Crop {props.platform}</button>{props.onRestore && <button type="button" disabled={props.disabled} onClick={() => void props.onRestore!()}>Restore {props.platform}</button>}<output data-testid={`${props.platform}-crop`}>{JSON.stringify({ source: props.sourceAssetId, crop: props.appliedCrop })}</output></> }));
const workspace = "507f1f77bcf86cd799439011";
const original = "507f1f77bcf86cd799439021";
const cropped = "507f1f77bcf86cd799439022";
const owner = "crop-owner";
beforeEach(() => {
  vi.mocked(createAutomaticCrop).mockImplementation(async (_workspace, originalAssetId, platform) => ({ assetId: originalAssetId, originalAssetId, crop: defaultCrop(platform) }));
  vi.mocked(generateCaption).mockResolvedValue("Shared caption");
  vi.mocked(validatePostBatch).mockResolvedValue({ issues: [] });
  vi.mocked(createPost).mockResolvedValue({} as Awaited<ReturnType<typeof createPost>>);
  vi.mocked(generateWorkspaceImage).mockResolvedValue({ assetId: original, status: "ready", created: true, creditsChargedNow: 1 });
  vi.mocked(getWorkspaceImageStatus).mockResolvedValue({ assetId: original, status: "ready", state: "ready", createdAt: "2026-11-22", updatedAt: "2026-11-22" });
  vi.mocked(getWorkspaceImageUrl).mockImplementation(async (_workspace, assetId) => ({ assetId, url: `https://example.test/${assetId}.png`, expiresIn: 60 }));
  vi.mocked(apiFetch).mockResolvedValue({ assetId: cropped });
});
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });
function open() {
  render(<AIPostFlow ownerId={owner} workspaceId={workspace} timezone="Asia/Manila" onBack={vi.fn()} connections={{ facebook: "page" }} destinations={null} />);
}
async function generate() {
  open();
  fireEvent.click(screen.getByRole("button", { name: "Custom" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Post brief" }), { target: { value: "A new coffee menu" } });
  fireEvent.click(screen.getByRole("button", { name: "instagram" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate post" }));
  await waitFor(() => expect(screen.getByText("1 of 1 selected")).toBeTruthy());
}
it("saves only the chosen platform crop and preserves the original without another generation", async () => {
  await generate();
  fireEvent.click(screen.getByRole("button", { name: "Crop instagram" }));
  await waitFor(() => expect(screen.getByRole("img", { name: "instagram post visual" })).toHaveAttribute("src", `https://example.test/${cropped}.png`));
  expect(screen.getByRole("img", { name: "facebook post visual" })).toHaveAttribute("src", `https://example.test/${original}.png`);
  expect(apiFetch).toHaveBeenCalledWith(`/api/ai/workspaces/${workspace}/upload-post-image`, expect.objectContaining({ method: "POST", body: expect.any(File) }));
  expect(generateWorkspaceImage).toHaveBeenCalledOnce();
  const batch = readAIReviewBatch(owner, workspace)!;
  expect(batch.posts[0].variants.find(v => v.platform === "instagram")).toMatchObject({ assetId: cropped, originalAssetId: original, crop: { format: "portrait", x: 75, y: 50, zoom: 1.2 } });
  fireEvent.click(screen.getByRole("button", { name: "Save as drafts" }));
  await waitFor(() => expect(createPost).toHaveBeenCalledTimes(2));
  const saved = vi.mocked(createPost).mock.calls.map(c => c[0]);
  expect(saved.find(post => post.platforms[0] === "facebook")?.mediaIds).toEqual([original]);
  expect(saved.find(post => post.platforms[0] === "instagram")?.mediaIds).toEqual([cropped]);
});
it("retains crop settings on reopen and restores the uncropped original", async () => {
  await generate();
  fireEvent.click(screen.getByRole("button", { name: "Crop instagram" }));
  await waitFor(() => expect(screen.getByTestId("instagram-crop")).toHaveTextContent('"x":75'));
  cleanup(); open();
  await waitFor(() => expect(screen.getByRole("img", { name: "instagram post visual" })).toHaveAttribute("src", `https://example.test/${cropped}.png`));
  expect(screen.getByTestId("instagram-crop")).toHaveTextContent('"source":"' + original + '"');
  expect(screen.getByTestId("instagram-crop")).toHaveTextContent('"x":75');
  fireEvent.click(screen.getByRole("button", { name: "Restore instagram" }));
  await waitFor(() => expect(screen.getByRole("img", { name: "instagram post visual" })).toHaveAttribute("src", `https://example.test/${original}.png`));
  expect(screen.queryByRole("button", { name: "Restore instagram" })).toBeNull();
  expect(generateWorkspaceImage).toHaveBeenCalledOnce();
  expect(apiFetch).toHaveBeenCalledOnce();
});

it("replaces custom crop settings with automatic framing when the shared image is regenerated", async () => {
  await generate();
  fireEvent.click(screen.getByRole("button", { name: "Crop instagram" }));
  await waitFor(() => expect(screen.getByTestId("instagram-crop")).toHaveTextContent('"x":75'));
  fireEvent.click(screen.getAllByRole("button", { name: "Regenerate shared image" })[0]);
  await waitFor(() => expect(generateWorkspaceImage).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(readAIReviewBatch(owner, workspace)!.posts[0].variants.every(v => v.crop?.x === 50 && v.crop?.zoom === 1)).toBe(true));
});

it("automatically creates a centered crop per platform from one AI image", async () => {
  vi.mocked(createAutomaticCrop).mockImplementation(async (_workspace, source, platform) => ({ assetId: platform === "facebook" ? "507f1f77bcf86cd799439023" : "507f1f77bcf86cd799439024", originalAssetId: source, crop: defaultCrop(platform) }));
  await generate();
  expect(generateCaption).toHaveBeenCalledOnce();
  expect(generateWorkspaceImage).toHaveBeenCalledOnce();
  expect(createAutomaticCrop).toHaveBeenCalledTimes(2);
  const variants = readAIReviewBatch(owner, workspace)!.posts[0].variants;
  expect(variants[0]).toMatchObject({ originalAssetId: original, crop: { format: "square", x: 50, y: 50, zoom: 1 }, autoCropPending: false });
  expect(variants[1]).toMatchObject({ originalAssetId: original, crop: { format: "portrait", x: 50, y: 50, zoom: 1 }, autoCropPending: false });
  expect(variants[0].assetId).not.toBe(variants[1].assetId);
  cleanup(); open();
  await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
  expect(createAutomaticCrop).toHaveBeenCalledTimes(2);
});
it("retries an automatic crop failure without another AI generation", async () => {
  vi.mocked(createAutomaticCrop).mockRejectedValueOnce(new Error("Storage unavailable"));
  open();
  fireEvent.click(screen.getByRole("button", { name: "Custom" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Post brief" }), { target: { value: "A coffee menu" } });
  fireEvent.click(screen.getByRole("button", { name: "Generate post" }));
  await screen.findByText("Automatic crop: Storage unavailable");
  expect(screen.getByRole("button", { name: "Save as drafts" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Retry automatic crop" }));
  await waitFor(() => expect(screen.getByText("1 of 1 selected")).toBeTruthy());
  expect(createAutomaticCrop).toHaveBeenCalledTimes(2);
  expect(generateWorkspaceImage).toHaveBeenCalledOnce();
  expect(generateCaption).toHaveBeenCalledOnce();
});
it("keeps an explicit choice to use the original after reopening", async () => {
  await generate();
  fireEvent.click(screen.getByRole("button", { name: "Restore instagram" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Restore instagram" })).toBeNull());
  const calls = vi.mocked(createAutomaticCrop).mock.calls.length;
  cleanup(); open();
  await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
  expect(createAutomaticCrop).toHaveBeenCalledTimes(calls);
  expect(screen.queryByRole("button", { name: "Restore instagram" })).toBeNull();
});

it("resumes only unfinished automatic crops after reopening", async () => {
  await generate();
  const batch = readAIReviewBatch(owner, workspace)!;
  batch.posts[0].busy = true;
  const instagram = batch.posts[0].variants.find(v => v.platform === "instagram")!;
  instagram.assetId = original;
  instagram.crop = undefined;
  instagram.autoCropPending = true;
  writeAIReviewBatch(owner, workspace, batch);
  cleanup(); open();
  await waitFor(() => expect(createAutomaticCrop).toHaveBeenCalledTimes(3));
  await waitFor(() => expect(readAIReviewBatch(owner, workspace)!.posts[0].variants.every(v => !v.autoCropPending)).toBe(true));
  expect(vi.mocked(createAutomaticCrop).mock.calls[2][2]).toBe("instagram");
  expect(generateWorkspaceImage).toHaveBeenCalledOnce();
});
