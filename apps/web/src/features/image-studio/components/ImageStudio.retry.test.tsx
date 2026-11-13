/**
 * @vitest-environment jsdom
 */

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { ImageStudio } from "./ImageStudio";

import {
  generateWorkspaceImage,
  getImageGenerationCredits,
  getWorkspaceImageStatus,
  getWorkspaceImageUrl,
} from "@/lib/imageGeneration";

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

vi.mock("./ImageHistoryGallery", () => ({
  ImageHistoryGallery: () => null,
}));

vi.mock("./BrandingPlacementPreview", () => ({
  BrandingPlacementPreview: () => null,
}));

vi.mock("../hooks/useWorkspaceLogoAvailability", () => ({
  useWorkspaceLogoAvailability: () => ({
    status: "available",
    logoAvailable: true,
  }),
}));

const workspaceId = "507f1f77bcf86cd799439011";

const assetId = "507f1f77bcf86cd799439022";

const originalPrompt = "A premium coffee product photographed in a studio.";

const changedPrompt = "A colorful landscape with mountains and a lake.";

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(getImageGenerationCredits).mockResolvedValue({
    credits: {
      available: 5,
      costPerImage: 1,
    },

    usage: {
      dayUtc: "2026-11-13",
      attempts: 0,
      dailyLimit: 10,
      active: 0,
      maxActive: 2,
    },
  });

  vi.mocked(getWorkspaceImageStatus).mockResolvedValue({
    assetId,
    status: "ready",
    state: "ready",
    createdAt: "2026-11-13T00:00:00.000Z",
    updatedAt: "2026-11-13T00:01:00.000Z",

    image: {
      width: 1024,
      height: 1024,
      mimeType: "image/png",
    },
  });

  vi.mocked(getWorkspaceImageUrl).mockResolvedValue({
    assetId,
    url: "https://example.test/signed-image",
    expiresIn: 60,
  });
});

afterEach(() => {
  cleanup();
});

describe("Image Studio immutable retry", () => {
  it("retries the exact original payload after the form changes", async () => {
    /**
     * First request: ambiguous network failure.
     *
     * Second request: backend reports success
     * for the same logical operation.
     */
    vi.mocked(generateWorkspaceImage)
      .mockRejectedValueOnce(new Error("Network connection lost."))
      .mockResolvedValueOnce({
        assetId,
        status: "pending",
        created: false,
        creditsChargedNow: 0,
      });

    render(<ImageStudio selectedWorkspaceId={workspaceId} />);

    /**
     * STEP 1: Configure the original request.
     */
    fireEvent.change(screen.getByLabelText("Image prompt"), {
      target: {
        value: originalPrompt,
      },
    });

    await waitFor(() => {
      expect(
        screen.getByRole<HTMLButtonElement>("button", {
          name: /generate image/i,
        }).disabled,
      ).toBe(false);
    });

    fireEvent.click(
      screen.getByRole("radio", {
        name: /text label/i,
      }),
    );

    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Text label",
      }),
      {
        target: {
          value: "BREW CO.",
        },
      },
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /generate image/i,
      }),
    );

    /**
     * STEP 2: Confirm the first POST failed
     * and original-request retry is offered.
     */
    const retryButton = await screen.findByRole("button", {
      name: /check \/ retry original request/i,
    });

    expect(generateWorkspaceImage).toHaveBeenCalledTimes(1);

    const firstCall = vi.mocked(generateWorkspaceImage).mock.calls[0];

    expect(firstCall?.[0]).toBe(workspaceId);

    const originalCommand = firstCall?.[1];

    expect(originalCommand).toBeDefined();

    expect(originalCommand?.image).toMatchObject({
      prompt: originalPrompt,
      aspectRatio: "square",

      branding: {
        type: "text",
        text: "BREW CO.",
        position: "bottom-right",
        sizePercent: 20,
        opacity: 0.8,
      },
    });

    expect(originalCommand?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);

    /**
     * Save the original JSON payload before
     * changing any form values.
     */
    const originalPayload = JSON.stringify(originalCommand);

    /**
     * STEP 3: Change the current form.
     *
     * The pending retry must remain unaffected.
     */
    fireEvent.change(screen.getByLabelText("Image prompt"), {
      target: {
        value: changedPrompt,
      },
    });

    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Text label",
      }),
      {
        target: {
          value: "STORM STUDIO",
        },
      },
    );

    fireEvent.click(
      screen.getByRole("radio", {
        name: /landscape/i,
      }),
    );

    /**
     * STEP 4: Retry the original request.
     */
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(generateWorkspaceImage).toHaveBeenCalledTimes(2);
    });

    const secondCall = vi.mocked(generateWorkspaceImage).mock.calls[1];

    expect(secondCall?.[0]).toBe(workspaceId);

    const retriedCommand = secondCall?.[1];

    /**
     * Critical assertions:
     *
     * Same key.
     * Same prompt.
     * Same aspect ratio.
     * Same branding configuration.
     */
    expect(JSON.stringify(retriedCommand)).toBe(originalPayload);

    expect(retriedCommand?.idempotencyKey).toBe(
      originalCommand?.idempotencyKey,
    );

    expect(retriedCommand?.image.branding).toMatchObject({
      type: "text",
      text: "BREW CO.",
      position: "bottom-right",
      sizePercent: 20,
      opacity: 0.8,
    });

    /**
     * The retry returns created: false.
     * It represents the same admitted operation.
     */
    await waitFor(() => {
      expect(getWorkspaceImageStatus).toHaveBeenCalledWith(
        workspaceId,
        assetId,
      );
    });

    expect(generateWorkspaceImage).toHaveBeenCalledTimes(2);
  });

  it("does not use current form state to create a retry", async () => {
    vi.mocked(generateWorkspaceImage)
      .mockRejectedValueOnce(new Error("Simulated ambiguous request."))
      .mockResolvedValueOnce({
        assetId,
        status: "pending",
        created: false,
        creditsChargedNow: 0,
      });

    render(<ImageStudio selectedWorkspaceId={workspaceId} />);

    fireEvent.change(screen.getByLabelText("Image prompt"), {
      target: {
        value: originalPrompt,
      },
    });

    await waitFor(() => {
      const button = screen.getByRole<HTMLButtonElement>("button", {
        name: /generate image/i,
      });

      expect(button.disabled).toBe(false);
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /generate image/i,
      }),
    );

    const retryButton = await screen.findByRole("button", {
      name: /check \/ retry original request/i,
    });

    const firstCommand = vi.mocked(generateWorkspaceImage).mock.calls[0]?.[1];

    expect(firstCommand?.image.branding).toEqual({
      type: "none",
    });

    /**
     * Change form selection to logo.
     *
     * This must not change an ambiguous
     * previously submitted unbranded request.
     */
    fireEvent.click(
      screen.getByRole("radio", {
        name: /workspace logo/i,
      }),
    );

    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(generateWorkspaceImage).toHaveBeenCalledTimes(2);
    });

    const secondCommand = vi.mocked(generateWorkspaceImage).mock.calls[1]?.[1];

    expect(secondCommand).toEqual(firstCommand);

    expect(secondCommand?.image.branding).toEqual({
      type: "none",
    });
  });
});
