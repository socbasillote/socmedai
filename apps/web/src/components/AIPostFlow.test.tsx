// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AIPostFlow } from "./AIPostFlow";
import { generateCaption } from "@/lib/aiContent";
import { createPost } from "@/lib/posts";
import { generateWorkspaceImage, getWorkspaceImageStatus, getWorkspaceImageUrl } from "@/lib/imageGeneration";
vi.mock("@/lib/aiContent", () => ({ generateCaption: vi.fn() }));
vi.mock("@/lib/posts", () => ({ createPost: vi.fn() }));
vi.mock("@/lib/imageGeneration", () => ({ generateWorkspaceImage: vi.fn(), getWorkspaceImageStatus: vi.fn(), getWorkspaceImageUrl: vi.fn(), uploadWorkspaceImageReference: vi.fn() }));
vi.mock("@/features/publishing/components/MediaLibraryPicker", () => ({ MediaLibraryPicker: () => null }));
beforeEach(() => { vi.mocked(generateCaption).mockResolvedValue("A useful caption"); vi.mocked(createPost).mockResolvedValue({} as Awaited<ReturnType<typeof createPost>>); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function setup() { render(<AIPostFlow workspaceId="507f1f77bcf86cd799439011" timezone="Asia/Manila" onBack={vi.fn()} connections={{ facebook: "page" }} destinations={null} />); fireEvent.change(screen.getByRole("textbox", { name: "Post brief" }), { target: { value: "Share our new coffee menu" } }); }
it("defaults to Engagement and single mode; generation does not persist posts", async () => {
  setup(); expect(screen.getByRole("button", { name: "Engagement" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("switch", { name: "Images" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate post" }));
  await screen.findByDisplayValue("A useful caption");
  expect(createPost).not.toHaveBeenCalled();
  expect(generateCaption).toHaveBeenCalledWith(expect.objectContaining({ goal: "engagement", platform: "facebook" }));
  expect(screen.getByText("1 of 1 selected")).toBeTruthy();
});
it("mixes goals and saves only selected posts", async () => {
  setup(); fireEvent.click(screen.getByRole("button", { name: "Bulk" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Mix different goals across the batch" }));
  fireEvent.click(screen.getByRole("switch", { name: "Images" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate 3 posts" }));
  await waitFor(() => expect(screen.getByText("3 of 3 selected")).toBeTruthy());
  expect(vi.mocked(generateCaption).mock.calls.map(call => call[0].goal)).toEqual(["engagement", "community-building", "entertainment"]);
  fireEvent.click(screen.getAllByRole("checkbox", { name: "Select post" })[1]);
  fireEvent.click(screen.getByRole("button", { name: "Save as drafts" }));
  await waitFor(() => expect(createPost).toHaveBeenCalledTimes(2));
  expect(vi.mocked(createPost).mock.calls.every(call => !call[0].scheduledAt)).toBe(true);
});
it("keeps failed images out of selection and exposes recovery actions", async () => {
  vi.mocked(generateWorkspaceImage).mockRejectedValue(new Error("Provider unavailable"));
  setup(); fireEvent.click(screen.getByRole("button", { name: "Generate post" }));
  await screen.findByText("Image: Provider unavailable");
  expect(screen.getByRole("checkbox", { name: "Select post" })).toBeDisabled();
  expect(screen.getByText("0 of 1 selected")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  expect(screen.getByLabelText("Upload replacement image")).toBeTruthy();
  expect(createPost).not.toHaveBeenCalled();
});
it("schedules only the selected post using the workspace timezone", async () => {
  setup(); fireEvent.click(screen.getByRole("switch", { name: "Images" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate post" }));
  await waitFor(() => expect(screen.getByText("1 of 1 selected")).toBeTruthy());
  fireEvent.change(screen.getByLabelText("Publish date and time"), { target: { value: "2099-01-15T09:00" } });
  fireEvent.click(screen.getByRole("button", { name: "Schedule 1 posts" }));
  await waitFor(() => expect(createPost).toHaveBeenCalledTimes(1));
  expect(createPost).toHaveBeenCalledWith(expect.objectContaining({ scheduledAt: "2099-01-15T01:00:00.000Z", platformConnections: { facebook: "page" } }));
});
it("retains unsaved platform versions after a partial failure without duplicating saved versions", async () => {
  vi.mocked(createPost).mockResolvedValueOnce({} as Awaited<ReturnType<typeof createPost>>).mockRejectedValueOnce(new Error("Temporary failure")).mockResolvedValue({} as Awaited<ReturnType<typeof createPost>>);
  setup(); fireEvent.click(screen.getByRole("button", { name: "linkedin" }));
  fireEvent.click(screen.getByRole("switch", { name: "Images" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate post" }));
  await waitFor(() => expect(screen.getByText("1 of 1 selected")).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Save as drafts" }));
  await screen.findByText(/Remaining posts are available to retry/);
  fireEvent.click(screen.getByRole("button", { name: "Save as drafts" }));
  await waitFor(() => expect(createPost).toHaveBeenCalledTimes(3));
  expect(vi.mocked(createPost).mock.calls.map(call => call[0].platforms[0])).toEqual(["facebook", "linkedin", "linkedin"]);
  expect(vi.mocked(createPost).mock.calls[1][0].clientDraftId).toBe(vi.mocked(createPost).mock.calls[2][0].clientDraftId);
});


function mockSuccessfulImages() {
  let assetNumber = 0;
  vi.mocked(generateWorkspaceImage).mockImplementation(async () => ({
    assetId: `507f1f77bcf86cd799439${String(++assetNumber).padStart(3, "0")}`,
    status: "ready", created: true, creditsChargedNow: 1,
  }));
  vi.mocked(getWorkspaceImageStatus).mockImplementation(async (_workspaceId, assetId) => ({
    assetId, status: "ready", state: "ready", createdAt: "2026-11-20T00:00:00Z", updatedAt: "2026-11-20T00:00:00Z",
  }));
  vi.mocked(getWorkspaceImageUrl).mockImplementation(async (_workspaceId, assetId) => ({
    assetId, url: `https://images.example.com/${assetId}.png`, expiresIn: 3600,
  }));
}
it("bulk creates three separate image assets from one entered brief", async () => {
  mockSuccessfulImages();
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Bulk" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate 3 posts" }));
  await waitFor(() => expect(screen.getByText("3 of 3 selected")).toBeTruthy());
  expect(generateWorkspaceImage).toHaveBeenCalledTimes(3);
  const commands = vi.mocked(generateWorkspaceImage).mock.calls.map(call => call[1]);
  expect(new Set(commands.map(command => command.idempotencyKey)).size).toBe(3);
  expect(commands.every(command => command.image.prompt.includes("Share our new coffee menu"))).toBe(true);
  const displayed = screen.getAllByRole("img", { name: "facebook post visual" });
  expect(displayed).toHaveLength(3);
  expect(new Set(displayed.map(img => img.getAttribute("src"))).size).toBe(3);
  expect(createPost).not.toHaveBeenCalled();
});
it("bulk creates an image per post per platform with the appropriate dimensions", async () => {
  mockSuccessfulImages();
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Bulk" }));
  fireEvent.click(screen.getByRole("button", { name: "linkedin" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate 3 posts" }));
  await waitFor(() => expect(screen.getByText("3 of 3 selected")).toBeTruthy());
  expect(generateWorkspaceImage).toHaveBeenCalledTimes(6);
  const commands = vi.mocked(generateWorkspaceImage).mock.calls.map(call => call[1]);
  expect(commands.map(command => command.image.aspectRatio)).toEqual(["square", "landscape", "square", "landscape", "square", "landscape"]);
  expect(new Set(commands.map(command => command.idempotencyKey)).size).toBe(6);
  expect(screen.getAllByRole("img")).toHaveLength(6);
});
it("continues the bulk batch when one image fails and selects only successful posts", async () => {
  mockSuccessfulImages();
  vi.mocked(getWorkspaceImageStatus).mockImplementation(async (_workspaceId, assetId) => ({
    assetId, status: assetId.endsWith("002") ? "failed" : "ready", state: assetId.endsWith("002") ? "failed" : "ready",
    message: assetId.endsWith("002") ? "Second image failed" : undefined,
    createdAt: "2026-11-20T00:00:00Z", updatedAt: "2026-11-20T00:00:00Z",
  }));
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Bulk" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate 3 posts" }));
  await waitFor(() => expect(screen.getByText("2 of 3 selected")).toBeTruthy());
  expect(generateWorkspaceImage).toHaveBeenCalledTimes(3);
  expect(screen.getAllByRole("img", { name: "facebook post visual" })).toHaveLength(2);
  const choices = screen.getAllByRole("checkbox", { name: "Select post" });
  expect(choices[0]).toBeChecked();
  expect(choices[1]).toBeDisabled();
  expect(choices[1]).not.toBeChecked();
  expect(choices[2]).toBeChecked();
  expect(screen.getByText("Image: Second image failed")).toBeTruthy();
});
