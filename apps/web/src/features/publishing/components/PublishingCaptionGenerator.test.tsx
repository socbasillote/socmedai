import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { generateCaption } from "@/lib/aiContent";
import { PublishingCaptionGenerator } from "./PublishingCaptionGenerator";
vi.mock("@/lib/aiContent", () => ({ generateCaption: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
const props = { disabled: false, initialBrief: "Our new coffee blend", defaultPlatform: "linkedin" as const, hasCaption: true, onApply: vi.fn() };
function open() { fireEvent.click(screen.getByRole("button", { name: "Generate caption with AI" })); }
function generate() { fireEvent.click(screen.getByRole("button", { name: "Generate caption" })); }
it("generates from the brief and preferences, applying only after explicit review", async () => {
  vi.mocked(generateCaption).mockResolvedValue("Fresh coffee for your morning.");
  render(<PublishingCaptionGenerator {...props} />);
  open();
  fireEvent.change(screen.getByLabelText("Tone"), { target: { value: "professional" } });
  fireEvent.change(screen.getByLabelText("Length"), { target: { value: "short" } });
  fireEvent.change(screen.getByLabelText("Audience (optional)"), { target: { value: "Coffee lovers" } });
  generate();
  await screen.findByText("Fresh coffee for your morning.");
  expect(generateCaption).toHaveBeenCalledWith({ brief: props.initialBrief, language: "en", platform: "linkedin", tone: "professional", length: "short", audience: "Coffee lovers", callToAction: "" });
  expect(props.onApply).not.toHaveBeenCalled();
  expect(screen.getByText(/replaces your current caption/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Use this caption" }));
  expect(props.onApply).toHaveBeenCalledWith("Fresh coffee for your morning.");
});

it("starts in the workspace language and honors an explicit content-language choice", async () => {
  vi.mocked(generateCaption).mockResolvedValue("Un nuevo café");
  render(<PublishingCaptionGenerator {...props} defaultLanguage="fil" />);
  open();
  expect(screen.getByLabelText("Content language")).toHaveValue("fil");
  fireEvent.change(screen.getByLabelText("Content language"), { target: { value: "es" } });
  generate();
  await screen.findByText("Un nuevo café");
  expect(generateCaption).toHaveBeenCalledWith(expect.objectContaining({ language: "es" }));
});
it("validates the brief before spending a generation attempt", () => {
  render(<PublishingCaptionGenerator {...props} initialBrief="" />);
  open(); generate();
  expect(screen.getByRole("alert")).toHaveTextContent("Describe your post");
  expect(generateCaption).not.toHaveBeenCalled();
});
it("shows provider errors and permits retry without altering the caption", async () => {
  vi.mocked(generateCaption).mockRejectedValueOnce(new Error("Caption generation limit reached."))
    .mockResolvedValueOnce("A new caption");
  render(<PublishingCaptionGenerator {...props} />); open(); generate();
  expect(await screen.findByRole("alert")).toHaveTextContent("limit reached");
  expect(props.onApply).not.toHaveBeenCalled();
  generate();
  await screen.findByText("A new caption");
});
it("prevents duplicate requests and ignores results after an editor context remount", async () => {
  let resolve!: (value: string) => void;
  vi.mocked(generateCaption).mockReturnValue(new Promise((done) => { resolve = done; }));
  const view = render(<PublishingCaptionGenerator key="workspace-a" {...props} />);
  open(); generate();
  fireEvent.click(screen.getByRole("button", { name: /Generating caption/ }));
  expect(generateCaption).toHaveBeenCalledTimes(1);
  view.rerender(<PublishingCaptionGenerator key="workspace-b" {...props} />);
  await act(async () => { resolve("Old workspace caption"); });
  open();
  expect(screen.queryByText("Old workspace caption")).not.toBeInTheDocument();
  expect(props.onApply).not.toHaveBeenCalled();
});
it("disables generation for a locked or unavailable editor", () => {
  render(<PublishingCaptionGenerator {...props} disabled />);
  expect(screen.getByRole("button", { name: "Generate caption with AI" })).toBeDisabled();
});
it("rejects an empty provider response", async () => {
  vi.mocked(generateCaption).mockResolvedValue("   ");
  render(<PublishingCaptionGenerator {...props} />); open(); generate();
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("invalid caption"));
  expect(screen.queryByRole("button", { name: "Use this caption" })).not.toBeInTheDocument();
});
