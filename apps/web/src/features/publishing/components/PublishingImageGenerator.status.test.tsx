/**
 * @vitest-environment jsdom
 */

import {
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
} from "@/lib/imageGeneration";

import { PublishingImageGenerator } from "./PublishingImageGenerator";

const WORKSPACE = "507f1f77bcf86cd799439011";
const ASSET = "507f1f77bcf86cd799439022";
const USER_A = "11111111-2222-4333-8444-555555555555";

const PROMPT = "A premium coffee product photographed in a studio.";

vi.mock("@/lib/imageGeneration", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/imageGeneration")>();

  return {
    ...actual,
    generateWorkspaceImage: vi.fn(),
    getImageGenerationCredits: vi.fn(),
    getWorkspaceImageStatus: vi.fn(),
  };
});

function details(state: "processing" | "ready" | "failed" | "action_required") {
  return {
    assetId: ASSET,
    status:
      state === "ready" ? "ready" : state === "failed" ? "failed" : "pending",
    state,
    createdAt: "2026-11-16T00:00:00.000Z",
    updatedAt: "2026-11-16T00:01:00.000Z",
    ...(state === "ready"
      ? {
          image: {
            width: 1024,
            height: 1024,
            mimeType: "image/png",
          },
        }
      : {}),
  } as Awaited<ReturnType<typeof getWorkspaceImageStatus>>;
}

async function startGeneration() {
  render(
    <PublishingImageGenerator ownerUserId={USER_A} workspaceId={WORKSPACE} />,
  );

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

  await screen.findByText("Generation request accepted");
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
    assetId: ASSET,
    status: "pending",
    created: true,
    creditsChargedNow: 1,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Publishing image generation status tracking", () => {
  it("fetches status only after generation was accepted", async () => {
    vi.mocked(getWorkspaceImageStatus).mockResolvedValue(details("processing"));

    await startGeneration();

    await waitFor(() => {
      expect(getWorkspaceImageStatus).toHaveBeenCalledWith(WORKSPACE, ASSET);
    });

    expect(generateWorkspaceImage).toHaveBeenCalledTimes(1);
  });
  /*
  it("honors Retry-After while polling without repeating generation", async () => {
    vi.mocked(getWorkspaceImageStatus).mockResolvedValue(details("processing"));
    await startGeneration();
    await waitFor(() => expect(getWorkspaceImageStatus).toHaveBeenCalledTimes(1));
    vi.useFakeTimers();
    vi.mocked(getWorkspaceImageStatus).mockRejectedValueOnce(new ApiError("Slow down", 429, 60_000));
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(getWorkspaceImageStatus).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(56_000); });
    expect(getWorkspaceImageStatus).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(getWorkspaceImageStatus).toHaveBeenCalledTimes(3);
    expect(generateWorkspaceImage).toHaveBeenCalledTimes(1);
  }); */

  it("shows ready state without another generation POST", async () => {
    vi.mocked(getWorkspaceImageStatus).mockResolvedValue(details("ready"));

    await startGeneration();

    expect(await screen.findByText(/your image is ready/i)).toBeTruthy();

    expect(generateWorkspaceImage).toHaveBeenCalledTimes(1);
  });

  it("shows failed generation without resubmitting", async () => {
    vi.mocked(getWorkspaceImageStatus).mockResolvedValue(details("failed"));

    await startGeneration();

    expect(await screen.findByText(/image generation failed/i)).toBeTruthy();

    expect(generateWorkspaceImage).toHaveBeenCalledTimes(1);
  });

  it("shows action-required recovery state", async () => {
    vi.mocked(getWorkspaceImageStatus).mockResolvedValue(
      details("action_required"),
    );

    await startGeneration();

    expect(
      await screen.findByText(/requires recovery or review/i),
    ).toBeTruthy();

    expect(generateWorkspaceImage).toHaveBeenCalledTimes(1);
  });

  it("refreshes status with GET instead of another POST", async () => {
    vi.mocked(getWorkspaceImageStatus)
      .mockRejectedValueOnce(new Error("Temporary failure"))
      .mockResolvedValueOnce(details("ready"));

    await startGeneration();

    const refresh = await screen.findByRole("button", {
      name: "Refresh generation status",
    });

    fireEvent.click(refresh);

    expect(await screen.findByText(/your image is ready/i)).toBeTruthy();

    expect(getWorkspaceImageStatus).toHaveBeenCalledTimes(2);

    expect(generateWorkspaceImage).toHaveBeenCalledTimes(1);
  });
});
