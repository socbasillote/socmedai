import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WorkspaceLogoUploader } from "./WorkspaceLogoUploader";

import {
  getWorkspaceLogo,
  getWorkspaceLogoPreview,
  uploadWorkspaceLogo,
  enableWorkspaceLogo,
  type WorkspaceLogoSettings,
} from "@/lib/workspaceLogo";

vi.mock("@/lib/workspaceLogo", () => ({
  getWorkspaceLogo: vi.fn(),
  getWorkspaceLogoPreview: vi.fn(),
  uploadWorkspaceLogo: vi.fn(),
  enableWorkspaceLogo: vi.fn(),
}));

const WORKSPACE_ID = "507f1f77bcf86cd799439011";

const SAVED_LOGO: WorkspaceLogoSettings = {
  enabled: true,
  logo: {
    storageKey: `workspaces/${WORKSPACE_ID}/logos/507f1f77bcf86cd799439012.png`,
    sha256: "a".repeat(64),
  },
  position: "bottom-right",
  sizePercent: 20,
  opacity: 0.8,
};

const EMPTY_LOGO: WorkspaceLogoSettings = {
  ...SAVED_LOGO,
  enabled: false,
  logo: null,
};

function createFile() {
  return new File([new Uint8Array([137, 80, 78, 71])], "brand.png", {
    type: "image/png",
  });
}

describe("WorkspaceLogoUploader", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    vi.mocked(getWorkspaceLogo).mockResolvedValue(EMPTY_LOGO);

    vi.mocked(getWorkspaceLogoPreview).mockResolvedValue({
      url: "https://example.test/logo-signed.png",
      expiresIn: 60,
    });

    vi.mocked(uploadWorkspaceLogo).mockResolvedValue({
      ...SAVED_LOGO,
      enabled: false,
    });

    vi.mocked(enableWorkspaceLogo).mockResolvedValue(SAVED_LOGO);
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the upload control when no logo exists", async () => {
    render(
      <WorkspaceLogoUploader workspaceId={WORKSPACE_ID} onReady={vi.fn()} />,
    );

    expect(
      await screen.findByText("Upload a logo to personalize generated images."),
    ).toBeTruthy();

    expect(
      screen.queryByRole("button", {
        name: "Refresh preview",
      }),
    ).toBeNull();
  });

  it("loads the saved logo after mounting", async () => {
    vi.mocked(getWorkspaceLogo).mockResolvedValue(SAVED_LOGO);

    render(
      <WorkspaceLogoUploader workspaceId={WORKSPACE_ID} onReady={vi.fn()} />,
    );

    const image = await screen.findByRole("img", {
      name: "Current workspace logo",
    });

    expect(image.getAttribute("src")).toBe(
      "https://example.test/logo-signed.png",
    );

    expect(getWorkspaceLogoPreview).toHaveBeenCalledWith(WORKSPACE_ID);
  });

  it("uploads, enables, and refreshes logo availability", async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();

    render(
      <WorkspaceLogoUploader workspaceId={WORKSPACE_ID} onReady={onReady} />,
    );

    const input = await screen.findByLabelText("Upload workspace logo");

    await user.upload(input, createFile());

    await waitFor(() => {
      expect(uploadWorkspaceLogo).toHaveBeenCalledOnce();

      expect(enableWorkspaceLogo).toHaveBeenCalledWith(WORKSPACE_ID);

      expect(onReady).toHaveBeenCalledOnce();
    });

    expect(
      await screen.findByText("Workspace logo saved and enabled."),
    ).toBeTruthy();
  });

  it("supports replacing an existing logo", async () => {
    const user = userEvent.setup();

    vi.mocked(getWorkspaceLogo).mockResolvedValue(SAVED_LOGO);

    vi.mocked(uploadWorkspaceLogo).mockResolvedValue(SAVED_LOGO);

    const onReady = vi.fn();

    render(
      <WorkspaceLogoUploader workspaceId={WORKSPACE_ID} onReady={onReady} />,
    );

    const input = await screen.findByLabelText("Replace workspace logo");

    await user.upload(input, createFile());

    await waitFor(() => {
      expect(uploadWorkspaceLogo).toHaveBeenCalledOnce();

      expect(onReady).toHaveBeenCalledOnce();
    });

    // Existing enabled logos do not require
    // another PATCH request.
    expect(enableWorkspaceLogo).not.toHaveBeenCalled();
  });

  it("keeps preview errors separate from upload availability", async () => {
    vi.mocked(getWorkspaceLogo).mockResolvedValue(SAVED_LOGO);

    vi.mocked(getWorkspaceLogoPreview).mockRejectedValue(
      new Error("Preview service unavailable"),
    );

    render(
      <WorkspaceLogoUploader workspaceId={WORKSPACE_ID} onReady={vi.fn()} />,
    );

    expect(
      await screen.findByText(
        "Logo preview is unavailable. Try refreshing it.",
      ),
    ).toBeTruthy();

    expect(screen.getByText("Saved workspace logo")).toBeTruthy();
  });

  it("retries enablement without uploading a second logo", async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();

    vi.mocked(enableWorkspaceLogo)
      .mockRejectedValueOnce(new Error("Temporary settings failure"))
      .mockResolvedValueOnce(SAVED_LOGO);

    render(
      <WorkspaceLogoUploader workspaceId={WORKSPACE_ID} onReady={onReady} />,
    );

    const input = await screen.findByLabelText("Upload workspace logo");

    await user.upload(input, createFile());

    const retryButton = await screen.findByRole("button", {
      name: "Retry enable",
    });

    expect(uploadWorkspaceLogo).toHaveBeenCalledTimes(1);
    expect(enableWorkspaceLogo).toHaveBeenCalledTimes(1);
    expect(onReady).not.toHaveBeenCalled();

    await user.click(retryButton);

    await waitFor(() => {
      expect(onReady).toHaveBeenCalledOnce();
    });

    expect(uploadWorkspaceLogo).toHaveBeenCalledTimes(1);
    expect(enableWorkspaceLogo).toHaveBeenCalledTimes(2);

    expect(await screen.findByText("Workspace logo enabled.")).toBeTruthy();
  });

  it("ignores an older preview response after a newer refresh", async () => {
    const user = userEvent.setup();

    vi.mocked(getWorkspaceLogo).mockResolvedValue(SAVED_LOGO);

    // The initial preview loads normally.
    vi.mocked(getWorkspaceLogoPreview).mockResolvedValueOnce({
      url: "https://example.test/original.png",
      expiresIn: 60,
    });

    let resolveOld!: (value: { url: string; expiresIn: number }) => void;

    let resolveNew!: (value: { url: string; expiresIn: number }) => void;

    const oldRequest = new Promise<{
      url: string;
      expiresIn: number;
    }>((resolve) => {
      resolveOld = resolve;
    });

    const newRequest = new Promise<{
      url: string;
      expiresIn: number;
    }>((resolve) => {
      resolveNew = resolve;
    });

    vi.mocked(getWorkspaceLogoPreview)
      .mockImplementationOnce(() => oldRequest)
      .mockImplementationOnce(() => newRequest);

    render(
      <WorkspaceLogoUploader workspaceId={WORKSPACE_ID} onReady={vi.fn()} />,
    );

    const image = await screen.findByRole("img", {
      name: "Current workspace logo",
    });

    await waitFor(() => {
      expect(image.getAttribute("src")).toBe(
        "https://example.test/original.png",
      );
    });

    const refreshButton = screen.getByRole("button", {
      name: "Refresh preview",
    });

    await user.click(refreshButton);
    await user.click(refreshButton);

    await waitFor(() => {
      expect(getWorkspaceLogoPreview).toHaveBeenCalledTimes(3);
    });

    // The newer request completes first.
    await act(async () => {
      resolveNew({
        url: "https://example.test/newer.png",
        expiresIn: 60,
      });
    });

    expect(image.getAttribute("src")).toBe("https://example.test/newer.png");

    // The older request completes afterward.
    await act(async () => {
      resolveOld({
        url: "https://example.test/older.png",
        expiresIn: 60,
      });
    });

    // The new preview must remain visible.
    expect(image.getAttribute("src")).toBe("https://example.test/newer.png");
  });
});
