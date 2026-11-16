/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import {
  generateWorkspaceImage,
  getImageGenerationCredits,
} from "@/lib/imageGeneration";

import { PublishingImageGenerator } from "./PublishingImageGenerator";

const USER_A = "11111111-2222-4333-8444-555555555555";

const WORKSPACE_A = "507f1f77bcf86cd799439011";

const PROMPT = "A premium coffee product photographed in a studio.";

vi.mock("@/lib/imageGeneration", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/imageGeneration")>();

  return {
    ...actual,
    getImageGenerationCredits: vi.fn(),
    generateWorkspaceImage: vi.fn(),
  };
});

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
});

afterEach(() => {
  cleanup();
});

describe("Publishing image generation ownership", () => {
  it("blocks generation without an authenticated owner", async () => {
    render(
      <PublishingImageGenerator ownerUserId={null} workspaceId={WORKSPACE_A} />,
    );

    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Image prompt",
      }),
      {
        target: {
          value: PROMPT,
        },
      },
    );

    await screen.findByText("5");

    const button = screen.getByRole<HTMLButtonElement>("button", {
      name: /generate image/i,
    });

    expect(button.disabled).toBe(true);

    expect(generateWorkspaceImage).not.toHaveBeenCalled();
  });

  it("allows an authenticated owner with valid generation settings", async () => {
    render(
      <PublishingImageGenerator
        ownerUserId={USER_A}
        workspaceId={WORKSPACE_A}
      />,
    );

    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Image prompt",
      }),
      {
        target: {
          value: PROMPT,
        },
      },
    );

    await waitFor(() => {
      const button = screen.getByRole<HTMLButtonElement>("button", {
        name: /generate image/i,
      });

      expect(button.disabled).toBe(false);
    });
  });
});
