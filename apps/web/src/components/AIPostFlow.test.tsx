import { createAutomaticCrop } from "@/features/publishing/automaticImageCrop";
import { defaultCrop } from "@/features/publishing/imageCrop";
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { ApiError } from "@/lib/api";
import { AIPostFlow } from "./AIPostFlow";
import { generateCaption } from "@/lib/aiContent";
import { createPost, validatePostBatch } from "@/lib/posts";
import { generateWorkspaceImage, getWorkspaceImageStatus, getWorkspaceImageUrl } from "@/lib/imageGeneration";
vi.mock("@/features/publishing/automaticImageCrop", () => ({ createAutomaticCrop: vi.fn() }));
vi.mock("@/lib/aiContent", () => ({ generateCaption: vi.fn() }));
vi.mock("@/lib/posts", () => ({ createPost: vi.fn(), validatePostBatch: vi.fn() }));
vi.mock("@/lib/imageGeneration", () => ({ generateWorkspaceImage: vi.fn(), getWorkspaceImageStatus: vi.fn(), getWorkspaceImageUrl: vi.fn(), uploadWorkspaceImageReference: vi.fn() }));
vi.mock("@/features/publishing/components/MediaLibraryPicker", () => ({ MediaLibraryPicker: () => null }));
beforeEach(() => {
  vi.mocked(createAutomaticCrop).mockImplementation(async (_workspace, originalAssetId, platform) => ({ assetId: originalAssetId, originalAssetId, crop: defaultCrop(platform) })); vi.mocked(validatePostBatch).mockResolvedValue({ issues: [] }); vi.mocked(generateCaption).mockResolvedValue("A useful caption"); vi.mocked(createPost).mockResolvedValue({} as Awaited<ReturnType<typeof createPost>>); });
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });
function setup(overrides: Partial<ComponentProps<typeof AIPostFlow>> = {}) { render(<AIPostFlow workspaceId="507f1f77bcf86cd799439011" timezone="Asia/Manila" onBack={vi.fn()} connections={{ facebook: "page" }} destinations={null} {...overrides} />); fireEvent.change(screen.getByRole("textbox", { name: "Post brief" }), { target: { value: "Share our new coffee menu" } }); }
it("defaults to no goal or call to action and single mode; generation does not persist posts", async () => {
  setup(); expect(screen.getByRole("button", { name: "No goal" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("switch", { name: "Images" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate post" }));
  await screen.findByDisplayValue("A useful caption");
  expect(createPost).not.toHaveBeenCalled();
  expect(generateCaption).toHaveBeenCalledWith(expect.objectContaining({ goal: undefined, platform: "facebook", callToAction: "Do not include a call to action or add an engagement question." }));
  expect(screen.getByText("1 of 1 selected")).toBeTruthy();
});
it("mixes goals and saves only selected posts", async () => {
  setup(); fireEvent.click(screen.getByRole("button", { name: "Bulk" }));
  fireEvent.click(screen.getByRole("button", { name: "Engagement" }));
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
it("bulk generates one square image and caption per post shared across platforms", async () => {
  mockSuccessfulImages();
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Bulk" }));
  fireEvent.click(screen.getByRole("button", { name: "linkedin" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate 3 posts" }));
  await waitFor(() => expect(screen.getByText("3 of 3 selected")).toBeTruthy());
  expect(generateWorkspaceImage).toHaveBeenCalledTimes(3);
  expect(generateCaption).toHaveBeenCalledTimes(3);
  const commands = vi.mocked(generateWorkspaceImage).mock.calls.map(call => call[1]);
  expect(commands.map(command => command.image.aspectRatio)).toEqual(["square", "square", "square"]);
  expect(new Set(commands.map(command => command.idempotencyKey)).size).toBe(3);
  const images = screen.getAllByRole("img");
  expect(images).toHaveLength(6);
  expect(new Set(images.map(img => img.getAttribute("src"))).size).toBe(3);
  fireEvent.click(screen.getByRole("button", { name: "Save as drafts" }));
  await waitFor(() => expect(createPost).toHaveBeenCalledTimes(6));
  const saved = vi.mocked(createPost).mock.calls.map(call => call[0]);
  for (let i = 0; i < 6; i += 2) {
    expect(saved[i].caption).toBe(saved[i + 1].caption);
    expect(saved[i].mediaIds).toEqual(saved[i + 1].mediaIds);
    expect(saved[i].clientDraftId).not.toBe(saved[i + 1].clientDraftId);
  }
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

async function scheduledBatch() {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Bulk" }));
  fireEvent.click(screen.getByRole("switch", { name: "Images" }));
  fireEvent.click(screen.getByRole("button", { name: "Spread across dates" }));
  fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2099-01-15" } });
  fireEvent.click(screen.getByRole("button", { name: "Generate 3 posts" }));
  await waitFor(() => expect(screen.getByText("3 of 3 selected")).toBeTruthy());
}
it("schedules a subset and lets the remaining posts be saved as drafts", async () => {
  await scheduledBatch();
  const choices = screen.getAllByRole("checkbox", { name: "Select post" });
  fireEvent.click(choices[1]); fireEvent.click(choices[2]);
  fireEvent.click(screen.getByRole("button", { name: "Schedule 1 posts" }));
  await waitFor(() => expect(screen.getAllByRole("checkbox", { name: "Select post" })).toHaveLength(2));
  for (const choice of screen.getAllByRole("checkbox", { name: "Select post" })) fireEvent.click(choice);
  expect(screen.getByRole("button", { name: "Save as drafts" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Save as drafts" }));
  await waitFor(() => expect(createPost).toHaveBeenCalledTimes(3));
  expect(vi.mocked(createPost).mock.calls.map(c => Boolean(c[0].scheduledAt))).toEqual([true, false, false]);
});
it("keeps scheduling available for remaining posts after saving a subset as drafts", async () => {
  await scheduledBatch();
  const choices = screen.getAllByRole("checkbox", { name: "Select post" });
  fireEvent.click(choices[1]); fireEvent.click(choices[2]);
  fireEvent.click(screen.getByRole("button", { name: "Save as drafts" }));
  await waitFor(() => expect(screen.getAllByRole("checkbox", { name: "Select post" })).toHaveLength(2));
  for (const choice of screen.getAllByRole("checkbox", { name: "Select post" })) fireEvent.click(choice);
  fireEvent.click(screen.getByRole("button", { name: "Schedule 2 posts" }));
  await waitFor(() => expect(createPost).toHaveBeenCalledTimes(3));
  expect(vi.mocked(createPost).mock.calls.map(c => Boolean(c[0].scheduledAt))).toEqual([false, true, true]);
});
it("preflights the whole selection and makes no writes if a later post violates server rules", async () => {
  vi.mocked(validatePostBatch).mockResolvedValueOnce({ issues: [{ index: 1, message: "This weekday is disabled in workspace publishing preferences." }] });
  await scheduledBatch();
  fireEvent.click(screen.getByRole("button", { name: "Schedule 3 posts" }));
  await waitFor(() => expect(screen.getAllByText("This weekday is disabled in workspace publishing preferences.")).toHaveLength(2));
  expect(validatePostBatch).toHaveBeenCalledWith(expect.arrayContaining([
    expect.objectContaining({ scheduledAt: "2099-01-15T01:00:00.000Z" }),
    expect.objectContaining({ scheduledAt: "2099-01-16T01:00:00.000Z" }),
    expect.objectContaining({ scheduledAt: "2099-01-17T01:00:00.000Z" }),
  ]));
  expect(createPost).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Save as drafts" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Save as drafts" }));
  await waitFor(() => expect(createPost).toHaveBeenCalledTimes(3));
  expect(vi.mocked(createPost).mock.calls.every(c => !c[0].scheduledAt)).toBe(true);
});
it("allows draft fallback after a definitive rejection with no saved posts", async () => {
  vi.mocked(createPost).mockRejectedValueOnce(new ApiError("Schedule no longer allowed.", 400));
  await scheduledBatch();
  fireEvent.click(screen.getByRole("button", { name: "Schedule 3 posts" }));
  await screen.findByText("Schedule no longer allowed.");
  fireEvent.click(screen.getByRole("button", { name: "Save as drafts" }));
  await waitFor(() => expect(createPost).toHaveBeenCalledTimes(4));
  expect(vi.mocked(createPost).mock.calls.slice(1).every(c => !c[0].scheduledAt)).toBe(true);
});
it("retries an unconfirmed scheduling request unchanged and continues the remaining batch", async () => {
  vi.mocked(createPost).mockRejectedValueOnce(new Error("Response lost"));
  await scheduledBatch();
  fireEvent.click(screen.getByRole("button", { name: "Schedule 3 posts" }));
  await screen.findByText("Response lost");
  expect(screen.getByText(/A save could not be confirmed/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Schedule 3 posts" }));
  await waitFor(() => expect(createPost).toHaveBeenCalledTimes(4));
  expect(vi.mocked(createPost).mock.calls[1][0]).toEqual(vi.mocked(createPost).mock.calls[0][0]);
  await waitFor(() => expect(screen.queryAllByRole("checkbox", { name: "Select post" })).toHaveLength(0));
});
it("shows invalid workspace dates as needing attention before a save attempt", async () => {
  setup({ publishingRules: { defaultPostMode: "draft", preferredTimes: [], allowedWeekdays: [0, 1, 2, 3, 4, 5, 6], minimumNoticeMinutes: 0, maximumAdvanceDays: 1 } });
  fireEvent.click(screen.getByRole("switch", { name: "Images" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate post" }));
  await waitFor(() => expect(screen.getByText("1 of 1 selected")).toBeTruthy());
  fireEvent.change(screen.getByLabelText("Publish date and time"), { target: { value: "2099-01-15T09:00" } });
  expect(screen.getByText("Schedule within 1 days.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Needs attention (1)" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Schedule 1 posts" }));
  await waitFor(() => expect(screen.getAllByText("Schedule within 1 days.")).toHaveLength(2));
  expect(createPost).not.toHaveBeenCalled();
});

it("allows draft fallback after scheduling is disabled between preflight and creation", async () => {
  vi.mocked(createPost).mockRejectedValueOnce(new ApiError("Scheduled publishing is disabled for this platform on the server.", 409));
  await scheduledBatch();
  fireEvent.click(screen.getByRole("button", { name: "Schedule 3 posts" }));
  await screen.findByText("Scheduled publishing is disabled for this platform on the server.");
  fireEvent.click(screen.getByRole("button", { name: "Save as drafts" }));
  await waitFor(() => expect(createPost).toHaveBeenCalledTimes(4));
  expect(vi.mocked(createPost).mock.calls.slice(1).every(c => !c[0].scheduledAt)).toBe(true);
});
it("clears an uncommitted request snapshot when retry preflight definitively rejects it", async () => {
  vi.mocked(createPost).mockRejectedValueOnce(new Error("Connection lost"));
  await scheduledBatch();
  fireEvent.click(screen.getByRole("button", { name: "Schedule 3 posts" }));
  await screen.findByText("Connection lost");
  vi.mocked(validatePostBatch).mockResolvedValueOnce({ issues: [{ index: 0, message: "Schedule within 1 days." }] });
  fireEvent.click(screen.getByRole("button", { name: "Schedule 3 posts" }));
  await waitFor(() => expect(screen.getAllByText("Schedule within 1 days.")).toHaveLength(2));
  expect(screen.queryByText(/A save could not be confirmed/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Save as drafts" }));
  await waitFor(() => expect(createPost).toHaveBeenCalledTimes(4));
});

it("keeps unconfirmed saves in review until the original request is recovered", async () => {
  vi.mocked(createPost).mockRejectedValueOnce(new Error("Response lost"));
  await scheduledBatch();
  fireEvent.click(screen.getByRole("button", { name: "Schedule 3 posts" }));
  await screen.findByText("Response lost");
  expect(screen.getByRole("button", { name: "Back to AI setup" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Schedule 3 posts" }));
  await waitFor(() => expect(screen.queryAllByRole("checkbox", { name: "Select post" })).toHaveLength(0));
  expect(screen.getByRole("button", { name: "Back to AI setup" })).toBeEnabled();
});

it("spreads every platform version weekly in workspace time across a year boundary", async () => {
  setup({ connections: { facebook: "page", linkedin: "account" } });
  fireEvent.click(screen.getByRole("button", { name: "Bulk" }));
  fireEvent.click(screen.getByRole("button", { name: "linkedin" }));
  fireEvent.click(screen.getByRole("switch", { name: "Images" }));
  fireEvent.click(screen.getByRole("button", { name: "Spread across dates" }));
  fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2099-12-28" } });
  fireEvent.change(screen.getByLabelText("Frequency"), { target: { value: "7" } });
  fireEvent.click(screen.getByRole("button", { name: "Generate 3 posts" }));
  await waitFor(() => expect(screen.getByText("3 of 3 selected")).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Schedule 3 posts" }));
  await waitFor(() => expect(createPost).toHaveBeenCalledTimes(6));
  const requests = vi.mocked(createPost).mock.calls.map(call => call[0]);
  expect(requests.map(request => request.scheduledAt)).toEqual([
    "2099-12-28T01:00:00.000Z", "2099-12-28T01:00:00.000Z",
    "2100-01-04T01:00:00.000Z", "2100-01-04T01:00:00.000Z",
    "2100-01-11T01:00:00.000Z", "2100-01-11T01:00:00.000Z",
  ]);
  expect(requests.map(request => request.platforms)).toEqual([
    ["facebook"], ["linkedin"], ["facebook"], ["linkedin"], ["facebook"], ["linkedin"],
  ]);
  expect(new Set(requests.map(request => request.clientDraftId)).size).toBe(6);
  expect(validatePostBatch).toHaveBeenCalledWith(requests);
});

it("pairs each bulk image with its own caption", async () => {
  mockSuccessfulImages();
  const captions = ["Water indoor herbs at the roots.", "Harvest basil leaves for dinner.", "Place mint beside a sunny window."];
  for (const caption of captions) vi.mocked(generateCaption).mockResolvedValueOnce(caption);
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Bulk" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate 3 posts" }));
  await waitFor(() => expect(screen.getByText("3 of 3 selected")).toBeTruthy());
  const prompts = vi.mocked(generateWorkspaceImage).mock.calls.map(c => c[1].image.prompt);
  captions.forEach((caption, i) => {
    expect(prompts[i]).toContain(caption);
    captions.filter(other => other !== caption).forEach(other => expect(prompts[i]).not.toContain(other));
  });
});
it("regenerates one shared image using the chosen edited caption and preserves other caption edits", async () => {
  mockSuccessfulImages();
  setup();
  fireEvent.click(screen.getByRole("button", { name: "linkedin" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate post" }));
  await waitFor(() => expect(screen.getByText("1 of 1 selected")).toBeTruthy());
  expect(generateCaption).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByRole("textbox", { name: "linkedin caption" }), { target: { value: "Pouring cold brew over ice." } });
  fireEvent.click(screen.getAllByRole("button", { name: "Regenerate shared image" })[1]);
  await waitFor(() => expect(generateWorkspaceImage).toHaveBeenCalledTimes(2));
  expect(vi.mocked(generateWorkspaceImage).mock.calls[1][1].image.prompt).toContain("Pouring cold brew over ice.");
  expect(vi.mocked(generateWorkspaceImage).mock.calls[1][1].image.aspectRatio).toBe("square");
  await waitFor(() => expect(screen.getByText("1 of 1 selected")).toBeTruthy());
  expect(generateCaption).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("textbox", { name: "facebook caption" })).toHaveValue("A useful caption");
  expect(screen.getByRole("textbox", { name: "linkedin caption" })).toHaveValue("Pouring cold brew over ice.");
  expect(new Set(screen.getAllByRole("img").map(img => img.getAttribute("src"))).size).toBe(1);
});
it("does not spend an image request when caption generation fails", async () => {
  mockSuccessfulImages();
  vi.mocked(generateCaption).mockRejectedValueOnce(new Error("Caption unavailable"));
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Generate post" }));
  await screen.findByText(/Caption unavailable/);
  expect(generateWorkspaceImage).not.toHaveBeenCalled();
  expect(screen.getByRole("checkbox", { name: "Select post" })).toBeDisabled();
});

const reviewOwner = "review-owner";
function reopenReview(ownerId = reviewOwner) {
  render(<AIPostFlow ownerId={ownerId} workspaceId="507f1f77bcf86cd799439011" timezone="Asia/Manila" onBack={vi.fn()} connections={{ facebook: "page" }} destinations={null} />);
}
it("returns from setup to the existing review without spending another generation", async () => {
  setup({ ownerId: reviewOwner });
  fireEvent.click(screen.getByRole("switch", { name: "Images" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate post" }));
  await screen.findByDisplayValue("A useful caption");
  fireEvent.change(screen.getByRole("textbox", { name: "facebook caption" }), { target: { value: "My edited caption" } });
  fireEvent.click(screen.getByRole("button", { name: "Back to AI setup" }));
  fireEvent.click(screen.getByRole("button", { name: "Return to review (1)" }));
  expect(screen.getByDisplayValue("My edited caption")).toBeTruthy();
  expect(generateCaption).toHaveBeenCalledTimes(1);
});
it("restores edited captions and selection after leaving and reopening", async () => {
  setup({ ownerId: reviewOwner });
  fireEvent.click(screen.getByRole("switch", { name: "Images" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate post" }));
  await waitFor(() => expect(screen.getByText("1 of 1 selected")).toBeTruthy());
  fireEvent.change(screen.getByRole("textbox", { name: "facebook caption" }), { target: { value: "Keep this edited caption" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Select post" }));
  cleanup(); reopenReview();
  await screen.findByDisplayValue("Keep this edited caption");
  expect(screen.getByRole("checkbox", { name: "Select post" })).not.toBeChecked();
  expect(generateCaption).toHaveBeenCalledTimes(1);
  expect(createPost).not.toHaveBeenCalled();
});
it("keeps another account's review private", async () => {
  setup({ ownerId: reviewOwner });
  fireEvent.click(screen.getByRole("switch", { name: "Images" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate post" }));
  await screen.findByDisplayValue("A useful caption");
  cleanup(); reopenReview("another-owner");
  expect(screen.queryByText("Review generated posts")).toBeNull();
  expect(screen.queryByDisplayValue("A useful caption")).toBeNull();
});
it("reopens an uncertain post save with its original request payload and key", async () => {
  vi.mocked(createPost).mockRejectedValueOnce(new Error("Connection lost"));
  setup({ ownerId: reviewOwner });
  fireEvent.click(screen.getByRole("switch", { name: "Images" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate post" }));
  await waitFor(() => expect(screen.getByText("1 of 1 selected")).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Save as drafts" }));
  await screen.findByText("Connection lost");
  const original = vi.mocked(createPost).mock.calls[0][0];
  cleanup(); reopenReview();
  await screen.findByText(/A save could not be confirmed/);
  fireEvent.click(screen.getByRole("button", { name: "Save as drafts" }));
  await waitFor(() => expect(createPost).toHaveBeenCalledTimes(2));
  expect(vi.mocked(createPost).mock.calls[1][0]).toEqual(original);
  cleanup(); reopenReview();
  expect(screen.queryByText("Review generated posts")).toBeNull();
});
it("resumes an accepted image job with GET requests after reopening", async () => {
  mockSuccessfulImages();
  let releaseStatus!: (result: Awaited<ReturnType<typeof getWorkspaceImageStatus>>) => void;
  vi.mocked(getWorkspaceImageStatus).mockImplementationOnce(() => new Promise(resolve => { releaseStatus = resolve; }));
  setup({ ownerId: reviewOwner });
  fireEvent.click(screen.getByRole("button", { name: "Generate post" }));
  await waitFor(() => expect(getWorkspaceImageStatus).toHaveBeenCalledTimes(1));
  const assetId = vi.mocked(getWorkspaceImageStatus).mock.calls[0][1];
  cleanup(); reopenReview();
  await screen.findByRole("img", { name: "facebook post visual" });
  expect(screen.getByDisplayValue("A useful caption")).toBeTruthy();
  expect(generateWorkspaceImage).toHaveBeenCalledTimes(1);
  expect(generateCaption).toHaveBeenCalledTimes(1);
  expect(vi.mocked(getWorkspaceImageStatus).mock.calls[1][1]).toBe(assetId);
  expect(JSON.stringify(localStorage)).not.toContain("https://images.example.com");
  releaseStatus({ assetId, status: "ready", state: "ready", createdAt: "2026-11-22", updatedAt: "2026-11-22" });
});
it("requires explicit discard before replacing an unfinished review batch", async () => {
  setup({ ownerId: reviewOwner });
  fireEvent.click(screen.getByRole("switch", { name: "Images" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate post" }));
  await screen.findByDisplayValue("A useful caption");
  fireEvent.click(screen.getByRole("button", { name: "Back to AI setup" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate post" }));
  await screen.findByText(/Finish reviewing this batch/);
  expect(generateCaption).toHaveBeenCalledTimes(1);
});

it("resumes an unconfirmed image submission with its original idempotency key", async () => {
  mockSuccessfulImages();
  vi.mocked(generateWorkspaceImage).mockRejectedValueOnce(new Error("Connection dropped"));
  setup({ ownerId: reviewOwner });
  fireEvent.click(screen.getByRole("button", { name: "Generate post" }));
  await screen.findByText("Image: Connection dropped");
  const original = vi.mocked(generateWorkspaceImage).mock.calls[0][1];
  cleanup(); reopenReview();
  fireEvent.click(await screen.findByRole("button", { name: "Resume image request" }));
  await screen.findByRole("img", { name: "facebook post visual" });
  expect(generateWorkspaceImage).toHaveBeenCalledTimes(2);
  expect(vi.mocked(generateWorkspaceImage).mock.calls[1][1]).toEqual(original);
  expect(generateCaption).toHaveBeenCalledTimes(1);
});

it("shares one caption and square image across Facebook, Instagram, and LinkedIn", async () => {
  mockSuccessfulImages();
  setup();
  fireEvent.click(screen.getByRole("button", { name: "instagram" }));
  fireEvent.click(screen.getByRole("button", { name: "linkedin" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate post" }));
  await waitFor(() => expect(screen.getByText("1 of 1 selected")).toBeTruthy());
  expect(generateCaption).toHaveBeenCalledTimes(1);
  expect(generateCaption).toHaveBeenCalledWith(expect.objectContaining({ platform: "instagram", length: "short", brief: expect.stringContaining("facebook, instagram, linkedin") }));
  expect(generateWorkspaceImage).toHaveBeenCalledTimes(1);
  expect(vi.mocked(generateWorkspaceImage).mock.calls[0][1].image.aspectRatio).toBe("square");
  expect(screen.getAllByDisplayValue("A useful caption")).toHaveLength(3);
  expect(new Set(screen.getAllByRole("img").map(img => img.getAttribute("src"))).size).toBe(1);
});
it("reopens a shared pending image with one status check and no extra generation", async () => {
  mockSuccessfulImages();
  let releaseStatus!: (result: Awaited<ReturnType<typeof getWorkspaceImageStatus>>) => void;
  vi.mocked(getWorkspaceImageStatus).mockImplementationOnce(() => new Promise(resolve => { releaseStatus = resolve; }));
  setup({ ownerId: reviewOwner });
  fireEvent.click(screen.getByRole("button", { name: "linkedin" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate post" }));
  await waitFor(() => expect(getWorkspaceImageStatus).toHaveBeenCalledTimes(1));
  const assetId = vi.mocked(getWorkspaceImageStatus).mock.calls[0][1];
  cleanup(); reopenReview();
  await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
  expect(getWorkspaceImageStatus).toHaveBeenCalledTimes(2);
  expect(generateWorkspaceImage).toHaveBeenCalledTimes(1);
  expect(generateCaption).toHaveBeenCalledTimes(1);
  expect(screen.getAllByDisplayValue("A useful caption")).toHaveLength(2);
  releaseStatus({ assetId, status: "ready", state: "ready", createdAt: "2026-11-22", updatedAt: "2026-11-22" });
});
it("resumes one unconfirmed shared image submission across platforms", async () => {
  mockSuccessfulImages();
  vi.mocked(generateWorkspaceImage).mockRejectedValueOnce(new Error("Connection dropped"));
  setup({ ownerId: reviewOwner });
  fireEvent.click(screen.getByRole("button", { name: "linkedin" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate post" }));
  await waitFor(() => expect(screen.getAllByText("Image: Connection dropped")).toHaveLength(2));
  const original = vi.mocked(generateWorkspaceImage).mock.calls[0][1];
  cleanup(); reopenReview();
  fireEvent.click((await screen.findAllByRole("button", { name: "Resume image request" }))[0]);
  await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
  expect(generateWorkspaceImage).toHaveBeenCalledTimes(2);
  expect(vi.mocked(generateWorkspaceImage).mock.calls[1][1]).toEqual(original);
  expect(generateCaption).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "Resume image request" })).toBeNull();
});

it("keeps caption questions out of the image prompt even when a goal and CTA are selected", async () => {
  mockSuccessfulImages();
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Engagement" }));
  fireEvent.click(screen.getByRole("button", { name: "Ask a question" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate post" }));
  await waitFor(() => expect(screen.getByText("1 of 1 selected")).toBeTruthy());
  expect(generateCaption).toHaveBeenCalledWith(expect.objectContaining({ goal: "engagement", callToAction: "Ask a question" }));
  const image = vi.mocked(generateWorkspaceImage).mock.calls[0][1].image;
  expect(image.goal).toBeUndefined();
  expect(image.prompt).toContain("Do not render the caption, questions, engagement prompts, calls to action, or hashtags as text in the image.");
});
it("allows clearing a selected goal before generating", async () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Engagement" }));
  fireEvent.click(screen.getByRole("button", { name: "No goal" }));
  fireEvent.click(screen.getByRole("switch", { name: "Images" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate post" }));
  await screen.findByDisplayValue("A useful caption");
  expect(generateCaption).toHaveBeenCalledWith(expect.objectContaining({ goal: undefined }));
});
