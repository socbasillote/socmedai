import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import { SelectedMediaPreview } from "./SelectedMediaPreview";

import { getMediaLibraryItem } from "@/lib/mediaLibrary";
import { getWorkspaceImageUrl } from "@/lib/imageGeneration";

vi.mock("@/lib/mediaLibrary", () => ({
  getMediaLibraryItem: vi.fn(),
}));

vi.mock("@/lib/imageGeneration", () => ({
  getWorkspaceImageUrl: vi.fn(),
}));

const ASSET_A = "507f1f77bcf86cd799439011";
const ASSET_B = "507f1f77bcf86cd799439012";

const SOURCE_WORKSPACE_A = "507f1f77bcf86cd799439013";
const SOURCE_WORKSPACE_B = "507f1f77bcf86cd799439014";

const imageA = {
  assetId: ASSET_A,
  sourceWorkspaceId: SOURCE_WORKSPACE_A,
  sourceWorkspaceName: "Coffee Shop",
  type: "image" as const,
  mimeType: "image/png",
  width: 1024,
  height: 1024,
  createdAt: "2026-11-01T00:00:00.000Z",
};

const imageB = {
  ...imageA,
  assetId: ASSET_B,
  sourceWorkspaceId: SOURCE_WORKSPACE_B,
  sourceWorkspaceName: "Beauty Brand",
};

describe("SelectedMediaPreview", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    vi.mocked(getMediaLibraryItem).mockResolvedValue(imageA);

    vi.mocked(getWorkspaceImageUrl).mockResolvedValue({
      assetId: ASSET_A,
      url: "https://example.test/private-image",
      expiresIn: 60,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("loads the saved image thumbnail", async () => {
    render(<SelectedMediaPreview assetId={ASSET_A} />);

    const image = await screen.findByRole("img", {
      name: "Selected post image",
    });

    expect(image.getAttribute("src")).toBe(
      "https://example.test/private-image",
    );
  });

  it("displays the original workspace name", async () => {
    render(<SelectedMediaPreview assetId={ASSET_A} />);

    expect(await screen.findByText("Coffee Shop")).toBeTruthy();
  });

  it("uses the source workspace when signing", async () => {
    render(<SelectedMediaPreview assetId={ASSET_A} />);

    await waitFor(() => {
      expect(getWorkspaceImageUrl).toHaveBeenCalledWith(
        SOURCE_WORKSPACE_A,
        ASSET_A,
      );
    });
  });

  it("refreshes a private image URL", async () => {
    const user = userEvent.setup();

    render(<SelectedMediaPreview assetId={ASSET_A} />);

    await screen.findByRole("img", {
      name: "Selected post image",
    });

    await user.click(
      screen.getByRole("button", {
        name: "Refresh preview",
      }),
    );

    await waitFor(() => {
      expect(getWorkspaceImageUrl).toHaveBeenCalledTimes(2);
    });
  });

  it("does not remove an attachment when preview fails", async () => {
    vi.mocked(getWorkspaceImageUrl).mockRejectedValue(
      new Error("Expired signed URL"),
    );

    render(<SelectedMediaPreview assetId={ASSET_A} />);

    expect(
      await screen.findByText(/saved attachment has not been removed/i),
    ).toBeTruthy();

    expect(getMediaLibraryItem).toHaveBeenCalledWith(ASSET_A);
  });

  it("handles an image-load failure", async () => {
    render(<SelectedMediaPreview assetId={ASSET_A} />);

    const image = await screen.findByRole("img", {
      name: "Selected post image",
    });

    fireEvent.error(image);

    expect(await screen.findByText(/private URL has expired/i)).toBeTruthy();
  });

  it("loads a different asset after selection changes", async () => {
    vi.mocked(getMediaLibraryItem).mockImplementation(async (assetId) =>
      assetId === ASSET_B ? imageB : imageA,
    );

    const { rerender } = render(<SelectedMediaPreview assetId={ASSET_A} />);

    await screen.findByText("Coffee Shop");

    rerender(<SelectedMediaPreview assetId={ASSET_B} />);

    await waitFor(() => {
      expect(getWorkspaceImageUrl).toHaveBeenCalledWith(
        SOURCE_WORKSPACE_B,
        ASSET_B,
      );
    });

    expect(await screen.findByText("Beauty Brand")).toBeTruthy();
  });
});
