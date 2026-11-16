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
  getWorkspaceImageStatus,
  getWorkspaceImageUrl,
} from "@/lib/imageGeneration";

import { readPublishingRecovery } from "@/features/publishing/publishingImageRecovery";

import { PublishingImageGenerator } from "./PublishingImageGenerator";

const USER_ID = "11111111-2222-4333-8444-555555555555";

const WORKSPACE_ID = "507f1f77bcf86cd799439011";

const ASSET_ID = "507f1f77bcf86cd799439022";

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

const scope = {
  ownerUserId: USER_ID,
  workspaceId: WORKSPACE_ID,
};

function renderGenerator(
  onUseImage: (assetId: string) => void,
  disabled = false,
) {
  return render(
    <PublishingImageGenerator
      ownerUserId={USER_ID}
      workspaceId={WORKSPACE_ID}
      onUseImage={onUseImage}
      disabled={disabled}
    />,
  );
}

async function submitImageGeneration() {
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
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: /generate image/i })
        .disabled,
    ).toBe(false);
  });

  fireEvent.click(
    screen.getByRole("button", {
      name: /generate image/i,
    }),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();

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
    assetId: ASSET_ID,
    status: "pending",
    created: true,
    creditsChargedNow: 1,
  });

  vi.mocked(getWorkspaceImageStatus).mockResolvedValue({
    assetId: ASSET_ID,
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
    assetId: ASSET_ID,
    url: "https://example.test/private-generated-image",
    expiresIn: 60,
  });
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe("Publishing image selection", () => {
  it("hands off a ready image only after the user clicks Use This Image", async () => {
    const onUseImage = vi.fn();

    renderGenerator(onUseImage);

    await submitImageGeneration();

    const button = await screen.findByRole<HTMLButtonElement>("button", {
      name: "Use This Image",
    });

    await waitFor(() => {
      expect(button.disabled).toBe(false);
    });

    expect(onUseImage).not.toHaveBeenCalled();

    fireEvent.click(button);

    expect(onUseImage).toHaveBeenCalledExactlyOnceWith(ASSET_ID);

    // Selecting an image must not submit another
    // generation request.
    expect(generateWorkspaceImage).toHaveBeenCalledTimes(1);
  });

  it("does not allow selection before image readiness", async () => {
    vi.mocked(getWorkspaceImageStatus).mockResolvedValue({
      assetId: ASSET_ID,
      status: "pending",
      state: "processing",
      createdAt: "2026-11-16T00:00:00.000Z",
      updatedAt: "2026-11-16T00:01:00.000Z",
    });

    const onUseImage = vi.fn();

    renderGenerator(onUseImage);

    await submitImageGeneration();

    await screen.findByText(/image generation is processing/i);

    expect(
      screen.queryByRole("button", {
        name: "Use This Image",
      }),
    ).toBeNull();

    expect(onUseImage).not.toHaveBeenCalled();

    expect(getWorkspaceImageUrl).not.toHaveBeenCalled();
  });

  it("disables image selection when the editor is locked", async () => {
    const onUseImage = vi.fn();

    const { rerender } = renderGenerator(onUseImage);

    await submitImageGeneration();

    const button = await screen.findByRole<HTMLButtonElement>("button", {
      name: "Use This Image",
    });

    await waitFor(() => {
      expect(button.disabled).toBe(false);
    });

    rerender(
      <PublishingImageGenerator
        ownerUserId={USER_ID}
        workspaceId={WORKSPACE_ID}
        onUseImage={onUseImage}
        disabled
      />,
    );

    expect(button.disabled).toBe(true);

    fireEvent.click(button);

    expect(onUseImage).not.toHaveBeenCalled();
  });

  it("retains the accepted recovery record after local selection", async () => {
    const onUseImage = vi.fn();

    renderGenerator(onUseImage);

    await submitImageGeneration();

    const button = await screen.findByRole<HTMLButtonElement>("button", {
      name: "Use This Image",
    });

    await waitFor(() => {
      expect(button.disabled).toBe(false);
    });

    fireEvent.click(button);

    const recovery = readPublishingRecovery(sessionStorage, scope);

    expect(recovery.status).toBe("found");

    if (recovery.status !== "found") {
      throw new Error("Missing generation recovery record.");
    }

    expect(recovery.record.state).toBe("accepted");

    if (recovery.record.state !== "accepted") {
      throw new Error("Expected accepted recovery record.");
    }

    expect(recovery.record.assetId).toBe(ASSET_ID);

    expect(onUseImage).toHaveBeenCalledWith(ASSET_ID);
  });
});
