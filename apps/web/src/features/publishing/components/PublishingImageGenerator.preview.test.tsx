/**
 * @vitest-environment jsdom
 */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  generateWorkspaceImage,
  getImageGenerationCredits,
  getWorkspaceImageStatus,
  getWorkspaceImageUrl,
} from "@/lib/imageGeneration";

import { PublishingImageGenerator } from "./PublishingImageGenerator";

const WORKSPACE_A = "507f1f77bcf86cd799439011";
const WORKSPACE_B = "507f1f77bcf86cd799439012";
const ASSET_A = "507f1f77bcf86cd799439022";
const USER_A = "11111111-2222-4333-8444-555555555555";

const PROMPT = "A premium coffee product photographed in a studio.";

vi.mock("@/lib/imageGeneration", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/imageGeneration")>();

  return {
    ...actual,
    generateWorkspaceImage: vi.fn(),
    getImageGenerationCredits: vi.fn(),
    getWorkspaceImageStatus: vi.fn(),
    getWorkspaceImageUrl: vi.fn(),
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;

  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

async function startReadyGeneration() {
  fireEvent.change(
    screen.getByRole("textbox", {
      name: "Image prompt",
    }),
    { target: { value: PROMPT } },
  );

  await waitFor(() => {
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: /generate image/i,
      }).disabled,
    ).toBe(false);
  });

  fireEvent.click(
    screen.getByRole("button", {
      name: /generate image/i,
    }),
  );

  await screen.findByText(/your image is ready/i);
}

beforeEach(() => {
  sessionStorage.clear();
  vi.resetAllMocks();

  vi.mocked(getImageGenerationCredits).mockResolvedValue({
    credits: {
      available: 5,
      costPerImage: 1,
    },
    usage: {
      dayUtc: "2026-11-16",
      attempts: 0,
      dailyLimit: 10,
      active: 0,
      maxActive: 2,
    },
  });

  vi.mocked(generateWorkspaceImage).mockResolvedValue({
    assetId: ASSET_A,
    status: "pending",
    created: true,
    creditsChargedNow: 1,
  });

  vi.mocked(getWorkspaceImageStatus).mockResolvedValue({
    assetId: ASSET_A,
    status: "ready",
    state: "ready",
    createdAt: "2026-11-16T00:00:00.000Z",
    updatedAt: "2026-11-16T00:01:00.000Z",
    image: {
      width: 1024,
      height: 1024,
      mimeType: "image/png",
    },
  });

  vi.mocked(getWorkspaceImageUrl).mockResolvedValue({
    assetId: ASSET_A,
    url: "https://example.test/private-image-a",
    expiresIn: 60,
  });
});

afterEach(() => {
  cleanup();
});

describe("Publishing image private preview", () => {
  it("loads the signed URL only after generation is ready", async () => {
    render(
      <PublishingImageGenerator
        ownerUserId={USER_A}
        workspaceId={WORKSPACE_A}
      />,
    );

    expect(getWorkspaceImageUrl).not.toHaveBeenCalled();

    await startReadyGeneration();

    await waitFor(() => {
      expect(getWorkspaceImageUrl).toHaveBeenCalledWith(WORKSPACE_A, ASSET_A);
    });

    const image = await screen.findByRole<HTMLImageElement>("img", {
      name: "AI-generated image preview",
    });

    expect(image.getAttribute("src")).toBe(
      "https://example.test/private-image-a",
    );

    expect(image.getAttribute("referrerpolicy")).toBe("no-referrer");
  });

  it("refreshes the signed URL without generating again", async () => {
    vi.mocked(getWorkspaceImageUrl)
      .mockResolvedValueOnce({
        assetId: ASSET_A,
        url: "https://example.test/old-preview",
        expiresIn: 60,
      })
      .mockResolvedValueOnce({
        assetId: ASSET_A,
        url: "https://example.test/new-preview",
        expiresIn: 60,
      });

    render(
      <PublishingImageGenerator
        ownerUserId={USER_A}
        workspaceId={WORKSPACE_A}
      />,
    );

    await startReadyGeneration();

    const image = await screen.findByRole<HTMLImageElement>("img", {
      name: "AI-generated image preview",
    });

    expect(image.getAttribute("src")).toContain("old-preview");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Refresh private preview",
      }),
    );

    await waitFor(() => {
      expect(
        screen
          .getByRole<HTMLImageElement>("img", {
            name: "AI-generated image preview",
          })
          .getAttribute("src"),
      ).toContain("new-preview");
    });

    expect(getWorkspaceImageUrl).toHaveBeenCalledTimes(2);
    expect(generateWorkspaceImage).toHaveBeenCalledTimes(1);
  });

  it("handles an expired image URL without resubmitting generation", async () => {
    render(
      <PublishingImageGenerator
        ownerUserId={USER_A}
        workspaceId={WORKSPACE_A}
      />,
    );

    await startReadyGeneration();

    const image = await screen.findByRole<HTMLImageElement>("img", {
      name: "AI-generated image preview",
    });

    fireEvent.error(image);

    expect(await screen.findByText(/private image link expired/i)).toBeTruthy();

    expect(
      screen.queryByRole("img", {
        name: "AI-generated image preview",
      }),
    ).toBeNull();

    expect(generateWorkspaceImage).toHaveBeenCalledTimes(1);
  });

  it("ignores a stale signed URL after workspace switching", async () => {
    const pendingPreview =
      deferred<Awaited<ReturnType<typeof getWorkspaceImageUrl>>>();

    vi.mocked(getWorkspaceImageUrl).mockReturnValue(pendingPreview.promise);

    const { rerender } = render(
      <PublishingImageGenerator
        ownerUserId={USER_A}
        workspaceId={WORKSPACE_A}
      />,
    );

    await startReadyGeneration();

    await waitFor(() => {
      expect(getWorkspaceImageUrl).toHaveBeenCalledTimes(1);
    });

    rerender(
      <PublishingImageGenerator
        ownerUserId={USER_A}
        workspaceId={WORKSPACE_B}
      />,
    );

    await act(async () => {
      pendingPreview.resolve({
        assetId: ASSET_A,
        url: "https://example.test/stale-image",
        expiresIn: 60,
      });

      await pendingPreview.promise;
    });

    expect(
      screen.queryByRole("img", {
        name: "AI-generated image preview",
      }),
    ).toBeNull();

    expect(screen.queryByText("https://example.test/stale-image")).toBeNull();
  });
});
