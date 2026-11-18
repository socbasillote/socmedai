import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import { MediaLibraryPicker } from "./MediaLibraryPicker";

import { getMediaLibrary } from "@/lib/mediaLibrary";
import { getWorkspaceImageUrl } from "@/lib/imageGeneration";

vi.mock("@/lib/mediaLibrary", () => ({
  getMediaLibrary: vi.fn(),
}));

vi.mock("@/lib/imageGeneration", () => ({
  getWorkspaceImageUrl: vi.fn(),
}));

const WORKSPACE_A = "507f1f77bcf86cd799439011";
const WORKSPACE_B = "507f1f77bcf86cd799439012";
const ASSET_A = "507f1f77bcf86cd799439013";
const ASSET_B = "507f1f77bcf86cd799439014";

const coffeeImage = {
  assetId: ASSET_A,
  sourceWorkspaceId: WORKSPACE_A,
  sourceWorkspaceName: "Coffee Shop",
  type: "image" as const,
  mimeType: "image/png",
  width: 1024,
  height: 1024,
  createdAt: "2026-11-01T00:00:00.000Z",
};

const beautyImage = {
  assetId: ASSET_B,
  sourceWorkspaceId: WORKSPACE_B,
  sourceWorkspaceName: "Beauty Brand",
  type: "image" as const,
  mimeType: "image/png",
  width: 1024,
  height: 1024,
  createdAt: "2026-11-02T00:00:00.000Z",
};

describe("MediaLibraryPicker workspace filters", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    vi.mocked(getMediaLibrary).mockImplementation(
      async (workspaceId, scope = "current") => ({
        scope,
        activeWorkspaceId: workspaceId,
        images:
          scope === "current" ? [coffeeImage] : [beautyImage, coffeeImage],
      }),
    );

    vi.mocked(getWorkspaceImageUrl).mockImplementation(
      async (_workspaceId, assetId) => ({
        assetId,
        url: `https://example.test/images/${assetId}`,
        expiresIn: 60,
      }),
    );
  });

  afterEach(() => {
    cleanup();
  });

  it("loads Current Workspace by default", async () => {
    render(
      <MediaLibraryPicker
        workspaceId={WORKSPACE_A}
        selectedAssetId={null}
        onSelect={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(getMediaLibrary).toHaveBeenCalledWith(WORKSPACE_A, "current", 12);
    });

    expect(
      await screen.findByRole("button", {
        name: `Select image ${ASSET_A}`,
      }),
    ).toBeTruthy();

    expect(
      screen.queryByRole("button", {
        name: `Select image ${ASSET_B}`,
      }),
    ).toBeNull();
  });

  it("loads images from all owned workspaces", async () => {
    const user = userEvent.setup();

    render(
      <MediaLibraryPicker
        workspaceId={WORKSPACE_A}
        selectedAssetId={null}
        onSelect={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "All Workspaces",
      }),
    );

    await waitFor(() => {
      expect(getMediaLibrary).toHaveBeenCalledWith(WORKSPACE_A, "all", 12);
    });

    expect(await screen.findByText("Beauty Brand")).toBeTruthy();

    expect(screen.getByText("Coffee Shop")).toBeTruthy();
  });

  it("requests previews using source workspace IDs", async () => {
    const user = userEvent.setup();

    render(
      <MediaLibraryPicker
        workspaceId={WORKSPACE_A}
        selectedAssetId={null}
        onSelect={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "All Workspaces",
      }),
    );

    await waitFor(() => {
      expect(getWorkspaceImageUrl).toHaveBeenCalledWith(WORKSPACE_B, ASSET_B);
    });
  });

  it("selects an image from another workspace", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <MediaLibraryPicker
        workspaceId={WORKSPACE_A}
        selectedAssetId={null}
        onSelect={onSelect}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "All Workspaces",
      }),
    );

    const selectButton = await screen.findByRole("button", {
      name: `Select image ${ASSET_B}`,
    });

    await user.click(selectButton);

    expect(onSelect).toHaveBeenCalledWith(ASSET_B);
  });

  it("does not fetch without an active workspace", () => {
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

    expect(getMediaLibrary).not.toHaveBeenCalled();
  });

  it("disables images whose previews are unavailable", async () => {
    vi.mocked(getWorkspaceImageUrl).mockRejectedValue(
      new Error("Unable to sign image"),
    );

    render(
      <MediaLibraryPicker
        workspaceId={WORKSPACE_A}
        selectedAssetId={null}
        onSelect={vi.fn()}
      />,
    );

    const button = await screen.findByRole("button", {
      name: `Select image ${ASSET_A}`,
    });

    expect(button.hasAttribute("disabled")).toBe(true);
  });

  it("resets the filter when active workspace changes", async () => {
    const user = userEvent.setup();

    const { rerender } = render(
      <MediaLibraryPicker
        workspaceId={WORKSPACE_A}
        selectedAssetId={null}
        onSelect={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "All Workspaces",
      }),
    );

    await waitFor(() => {
      expect(getMediaLibrary).toHaveBeenCalledWith(WORKSPACE_A, "all", 12);
    });

    rerender(
      <MediaLibraryPicker
        workspaceId={WORKSPACE_B}
        selectedAssetId={null}
        onSelect={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen
          .getByRole("button", {
            name: "Current Workspace",
          })
          .getAttribute("aria-pressed"),
      ).toBe("true");
    });

    await waitFor(() => {
      expect(getMediaLibrary).toHaveBeenCalledWith(WORKSPACE_B, "current", 12);
    });
  });
  it("uses batched previews without per-image API requests", async () => {
    vi.mocked(getMediaLibrary).mockResolvedValue({ scope: "current", activeWorkspaceId: WORKSPACE_A,
      images: [{ ...coffeeImage, previewUrl: "https://example.test/batch-a" }, { ...beautyImage, previewUrl: null }] });
    render(<MediaLibraryPicker workspaceId={WORKSPACE_A} selectedAssetId={null} onSelect={vi.fn()} />);
    await screen.findByRole("button", { name: `Select image ${ASSET_A}` });
    expect(getWorkspaceImageUrl).not.toHaveBeenCalled();
  });

});
