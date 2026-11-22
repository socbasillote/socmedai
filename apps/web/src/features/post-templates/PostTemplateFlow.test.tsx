import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import { defaultBrandKit } from "@/lib/brandKit";
import type { Workspace } from "@/lib/workspaces";
import { generateWorkspaceImage, getImageGenerationCredits, getWorkspaceImageStatus } from "@/lib/imageGeneration";
import { renderTemplate } from "./renderTemplate";
import { PostTemplateFlow } from "./PostTemplateFlow";

vi.mock("@/lib/api", async original => ({ ...await original<typeof import("@/lib/api")>(), apiFetch: vi.fn() }));
vi.mock("@/lib/imageGeneration", async original => ({ ...await original<typeof import("@/lib/imageGeneration")>(), generateWorkspaceImage: vi.fn(), getImageGenerationCredits: vi.fn(), getWorkspaceImageStatus: vi.fn(), getWorkspaceImageUrl: vi.fn(async () => ({ url: "https://example.test/background.png" })) }));
vi.mock("./renderTemplate", () => ({ renderTemplate: vi.fn() }));
const workspace: Workspace = { _id: "507f1f77bcf86cd799439011", ownerUserId: "owner", name: "Coffee", settings: { brandKit: defaultBrandKit }, createdAt: "", updatedAt: "" };
const imageId = "507f1f77bcf86cd799439012";
beforeEach(() => {
  localStorage.clear();
  vi.mocked(renderTemplate).mockResolvedValue(new Blob(["pixels"], { type: "image/png" }));
  vi.mocked(apiFetch).mockResolvedValue({ assetId: imageId });
  vi.mocked(getImageGenerationCredits).mockResolvedValue({ credits: { available: 10, costPerImage: 1 }, usage: { dayUtc: "", attempts: 0, active: 0, dailyLimit: 10, maxActive: 2 } });
  vi.mocked(generateWorkspaceImage).mockResolvedValue({ assetId: imageId, status: "pending", created: true, creditsChargedNow: 1 });
  vi.mocked(getWorkspaceImageStatus).mockResolvedValue({ assetId: imageId, status: "ready", state: "ready", createdAt: "", updatedAt: "" });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, blob: async () => new Blob(["image"]) })));
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ close: vi.fn() })));
  URL.createObjectURL = vi.fn(() => "blob:preview"); URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
function open(onComposer = vi.fn(), selected = workspace) { return render(<PostTemplateFlow ownerId="owner" workspace={selected} onComposer={onComposer} />); }
function chooseQuote(brand: "yes" | "no" = "no") {
  fireEvent.click(screen.getByRole("button", { name: /Editorial Portrait Quote/ }));
  fireEvent.click(screen.getByRole("radio", { name: brand === "yes" ? "Yes, use brand kit" : "No, use design defaults" }));
  fireEvent.change(screen.getByLabelText("Quote"), { target: { value: "Make every day count." } });
}
it("offers four categories of designs and a custom alternative", () => {
  open();
  expect(screen.getByRole("button", { name: /Minimal Product Spotlight/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /Bold Sale Promo/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /Event Announcement/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Quotes" }));
  expect(screen.queryByRole("button", { name: /Minimal Product Spotlight/ })).toBeNull();
});
it.each(["yes", "no"] as const)("renders the selected design with brand choice %s and sends the exported image to composer", async brand => {
  const onComposer = vi.fn(); open(onComposer); chooseQuote(brand);
  expect(screen.getByText("Optional details").closest("details")).not.toHaveAttribute("open");
  fireEvent.click(screen.getByRole("button", { name: "Generate preview" }));
  await screen.findByRole("img", { name: "Editorial Portrait Quote preview" });
  expect(vi.mocked(renderTemplate).mock.calls.at(-1)?.[1]).toEqual(brand === "yes" ? defaultBrandKit : undefined);
  expect(generateWorkspaceImage).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Send to composer" }));
  await waitFor(() => expect(onComposer).toHaveBeenCalledWith({ assetId: imageId, title: "Editorial Portrait Quote", caption: "Make every day count." }));
});
it("requires the brand decision and offers defaults if no kit exists", () => {
  open(vi.fn(), { ...workspace, settings: {} });
  fireEvent.click(screen.getByRole("button", { name: /Editorial Portrait Quote/ }));
  expect(screen.getByRole("button", { name: "Generate preview" })).toBeDisabled();
  expect(screen.getByRole("radio", { name: "Yes, use brand kit" })).toBeDisabled();
  fireEvent.click(screen.getByRole("radio", { name: "No, use design defaults" }));
  expect(screen.getByRole("button", { name: "Generate preview" })).not.toBeDisabled();
});
it("updates editable text without generating another background", async () => {
  open(); chooseQuote(); fireEvent.click(screen.getByRole("button", { name: "Generate preview" }));
  await screen.findByRole("img", { name: "Editorial Portrait Quote preview" });
  fireEvent.change(screen.getByLabelText("Quote"), { target: { value: "My edited quote" } });
  await waitFor(() => expect(vi.mocked(renderTemplate).mock.calls.at(-1)?.[0].values.quote).toBe("My edited quote"));
  expect(generateWorkspaceImage).not.toHaveBeenCalled();
});
it("retries an uncertain background with the original key and brand opt-out", async () => {
  vi.mocked(generateWorkspaceImage).mockRejectedValueOnce(new Error("Connection lost"));
  open(); chooseQuote();
  fireEvent.click(screen.getByRole("button", { name: /Generate AI background/ }));
  await screen.findByText("Connection lost");
  const original = vi.mocked(generateWorkspaceImage).mock.calls[0][1];
  expect(original.image.useBrandKit).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Check / retry original background request" }));
  await waitFor(() => expect(generateWorkspaceImage).toHaveBeenCalledTimes(2));
  expect(vi.mocked(generateWorkspaceImage).mock.calls[1][1]).toEqual(original);
  await screen.findByRole("img", { name: "Editorial Portrait Quote preview" });
});
it("persists the template inputs under the account and workspace", async () => {
  const view = open(); chooseQuote("yes"); view.unmount();
  open(); expect(screen.getByLabelText("Quote")).toHaveValue("Make every day count.");
  expect(screen.getByRole("radio", { name: "Yes, use brand kit" })).toBeChecked();
  await waitFor(() => expect(getImageGenerationCredits).toHaveBeenCalled());
});
it("generates a custom image with an explicit brand-kit opt-in", async () => {
  open();
  fireEvent.click(screen.getByRole("button", { name: /^Custom Describe your own image/ }));
  fireEvent.click(screen.getByRole("radio", { name: "Yes, use brand kit" }));
  fireEvent.change(screen.getByLabelText("Image details"), { target: { value: "A quiet coffee shop with morning sunlight" } });
  fireEvent.click(screen.getByRole("button", { name: /Generate custom image/ }));
  await waitFor(() => expect(generateWorkspaceImage).toHaveBeenCalledWith(workspace._id, expect.objectContaining({ image: expect.objectContaining({ useBrandKit: true, prompt: expect.stringContaining("A quiet coffee shop") }) })));
  await screen.findByRole("img", { name: "Custom preview" });
});
it("preserves the uploaded product instead of sending it through AI generation", async () => {
  open();
  fireEvent.click(screen.getByRole("button", { name: /Minimal Product Spotlight/ }));
  fireEvent.click(screen.getByRole("radio", { name: "No, use design defaults" }));
  fireEvent.change(screen.getByLabelText("Product name"), { target: { value: "House blend" } });
  fireEvent.change(screen.getByLabelText("Product photo"), { target: { files: [new File(["pixels"], "coffee.png", { type: "image/png" })] } });
  await screen.findByText("Photo uploaded");
  fireEvent.click(screen.getByRole("button", { name: "Generate preview" }));
  await screen.findByRole("img", { name: "Minimal Product Spotlight preview" });
  expect(vi.mocked(renderTemplate).mock.calls.at(-1)?.[0].photoAssetId).toBe(imageId);
  expect(vi.mocked(renderTemplate).mock.calls.at(-1)?.[2]?.photo).toBeDefined();
  expect(generateWorkspaceImage).not.toHaveBeenCalled();
});
it("recovers a known background job after reopening without a second generation", async () => {
  vi.mocked(getWorkspaceImageStatus).mockResolvedValueOnce({ assetId: imageId, status: "pending", state: "processing", createdAt: "", updatedAt: "" });
  const view = open(); chooseQuote();
  fireEvent.click(screen.getByRole("button", { name: /Generate AI background/ }));
  await waitFor(() => expect(getWorkspaceImageStatus).toHaveBeenCalledOnce());
  view.unmount(); open();
  await screen.findByRole("img", { name: "Editorial Portrait Quote preview" });
  expect(generateWorkspaceImage).toHaveBeenCalledOnce();
});
it("blocks exporting incomplete edits instead of sending the previous preview", async () => {
  open(); chooseQuote(); fireEvent.click(screen.getByRole("button", { name: "Generate preview" }));
  await screen.findByRole("img", { name: "Editorial Portrait Quote preview" });
  fireEvent.change(screen.getByLabelText("Quote"), { target: { value: "" } });
  await waitFor(() => expect(screen.queryByRole("button", { name: "Send to composer" })).toBeNull());
  expect(screen.getByText("Enter quote.")).toBeTruthy();
});
