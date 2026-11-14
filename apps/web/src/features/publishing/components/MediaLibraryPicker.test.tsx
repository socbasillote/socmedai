import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import { MediaLibraryPicker } from "./MediaLibraryPicker";

import {
  getWorkspaceImageHistory,
  getWorkspaceImageUrl,
} from "@/lib/imageGeneration";

vi.mock("@/lib/imageGeneration", () => ({
  getWorkspaceImageHistory: vi.fn(),
  getWorkspaceImageUrl: vi.fn(),
}));

const WORKSPACE_ID = "507f1f77bcf86cd799439011";
const ASSET_ID = "507f1f77bcf86cd799439012";

const readyImage = {
  assetId: ASSET_ID,
  status: "ready" as const,
  state: "ready" as const,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  aspectRatio: "square" as const,
  image: {
    width: 1024,
    height: 1024,
    mimeType: "image/png" as const,
  },
};

describe("MediaLibraryPicker", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    vi.mocked(getWorkspaceImageHistory).mockResolvedValue({
      images: [readyImage],
      nextCursor: null,
      hasMore: false,
    });

    vi.mocked(getWorkspaceImageUrl).mockResolvedValue({
      assetId: ASSET_ID,
      url: "https://example.test/signed-image",
      expiresIn: 60,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("loads ready workspace images", async () => {
    render(
      <MediaLibraryPicker
        workspaceId={WORKSPACE_ID}
        selectedAssetId={null}
        onSelect={vi.fn()}
      />,
    );

    const image = await screen.findByRole("img", {
      name: "Generated workspace image",
    });

    expect(image.getAttribute("src")).toBe("https://example.test/signed-image");

    expect(getWorkspaceImageHistory).toHaveBeenCalledWith(WORKSPACE_ID, {
      limit: 12,
    });
  });

  it("returns the selected media asset ID", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <MediaLibraryPicker
        workspaceId={WORKSPACE_ID}
        selectedAssetId={null}
        onSelect={onSelect}
      />,
    );

    const button = await screen.findByRole("button", {
      name: `Select image ${ASSET_ID}`,
    });

    await user.click(button);

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(ASSET_ID);
  });

  it("does not fetch images without a workspace", () => {
    render(
      <MediaLibraryPicker
        workspaceId={null}
        selectedAssetId={null}
        onSelect={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Select a workspace to view its images."),
    ).toBeTruthy();

    expect(getWorkspaceImageHistory).not.toHaveBeenCalled();
  });

  it("does not display failed generations", async () => {
    vi.mocked(getWorkspaceImageHistory).mockResolvedValue({
      images: [
        {
          ...readyImage,
          status: "failed",
          state: "failed",
        },
      ],
      nextCursor: null,
      hasMore: false,
    });

    render(
      <MediaLibraryPicker
        workspaceId={WORKSPACE_ID}
        selectedAssetId={null}
        onSelect={vi.fn()}
      />,
    );

    expect(await screen.findByText("No ready images found")).toBeTruthy();

    expect(getWorkspaceImageUrl).not.toHaveBeenCalled();
  });

  it("does not allow selection without a preview URL", async () => {
    vi.mocked(getWorkspaceImageUrl).mockRejectedValue(
      new Error("Temporary signing failure"),
    );

    const onSelect = vi.fn();
    const user = userEvent.setup();

    render(
      <MediaLibraryPicker
        workspaceId={WORKSPACE_ID}
        selectedAssetId={null}
        onSelect={onSelect}
      />,
    );

    const button = await screen.findByRole("button", {
      name: `Select image ${ASSET_ID}`,
    });

    await waitFor(() => {
      expect(button.hasAttribute("disabled")).toBe(true);
    });

    await user.click(button);

    expect(onSelect).not.toHaveBeenCalled();
  });
});
