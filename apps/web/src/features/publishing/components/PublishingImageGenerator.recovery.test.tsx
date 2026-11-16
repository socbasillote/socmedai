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
  type GenerateImageCommand,
} from "@/lib/imageGeneration";

import {
  createAcceptedRecovery,
  getPublishingRecoveryKey,
  readPublishingRecovery,
  savePublishingRecovery,
} from "@/features/publishing/publishingImageRecovery";

import { PublishingImageGenerator } from "./PublishingImageGenerator";

const USER_A = "11111111-2222-4333-8444-555555555555";

const WORKSPACE_A = "507f1f77bcf86cd799439011";

const ASSET_A = "507f1f77bcf86cd799439022";

const PROMPT = "A premium coffee product photographed in a studio.";

const scope = {
  ownerUserId: USER_A,
  workspaceId: WORKSPACE_A,
};

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

function renderGenerator() {
  return render(
    <PublishingImageGenerator ownerUserId={USER_A} workspaceId={WORKSPACE_A} />,
  );
}

async function generate() {
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

function makeCommand(): GenerateImageCommand {
  return {
    idempotencyKey: "11111111-2222-4333-8444-555555555555",
    image: {
      prompt: PROMPT,
      aspectRatio: "square",
      branding: { type: "none" },
    },
  };
}

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.clear();
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
    url: "https://example.test/generated-image",
    expiresIn: 60,
  });
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe("Publishing generator recovery integration", () => {
  it("saves an uncertain command before the generation POST", async () => {
    vi.mocked(generateWorkspaceImage).mockImplementation(async () => {
      const result = readPublishingRecovery(sessionStorage, scope);

      expect(result.status).toBe("found");

      if (result.status !== "found") {
        throw new Error("Missing pre-POST recovery");
      }

      expect(result.record.state).toBe("uncertain");

      if (result.record.state !== "uncertain") {
        throw new Error("Expected uncertain command");
      }

      expect(result.record.command.image.prompt).toBe(PROMPT);

      throw new Error("Simulated network timeout");
    });

    renderGenerator();

    await generate();

    expect(
      await screen.findByText("Generation request requires verification"),
    ).toBeTruthy();

    expect(generateWorkspaceImage).toHaveBeenCalledTimes(1);
  });

  it("persists the accepted asset after submission", async () => {
    vi.mocked(generateWorkspaceImage).mockResolvedValue({
      assetId: ASSET_A,
      status: "pending",
      created: true,
      creditsChargedNow: 1,
    });

    renderGenerator();

    await generate();

    await screen.findByText("Generation request accepted");

    expect(readPublishingRecovery(sessionStorage, scope)).toEqual({
      status: "found",
      record: expect.objectContaining({
        state: "accepted",
        assetId: ASSET_A,
      }),
    });
  });

  it("restores an accepted asset without generating again", async () => {
    savePublishingRecovery(
      sessionStorage,
      scope,
      createAcceptedRecovery(scope, ASSET_A),
    );

    renderGenerator();

    await waitFor(() => {
      expect(getWorkspaceImageStatus).toHaveBeenCalledWith(
        WORKSPACE_A,
        ASSET_A,
      );
    });

    expect(generateWorkspaceImage).not.toHaveBeenCalled();

    expect(await screen.findByText(/your image is ready/i)).toBeTruthy();
  });

  it("restores an uncertain request and retries the original command", async () => {
    const command = makeCommand();

    const { createUncertainRecovery } =
      await import("@/features/publishing/publishingImageRecovery");

    savePublishingRecovery(
      sessionStorage,
      scope,
      createUncertainRecovery(scope, command),
    );

    vi.mocked(generateWorkspaceImage).mockResolvedValue({
      assetId: ASSET_A,
      status: "pending",
      created: false,
      creditsChargedNow: 0,
    });

    renderGenerator();

    const retry = await screen.findByRole("button", {
      name: /check \/ retry original request/i,
    });

    expect(generateWorkspaceImage).not.toHaveBeenCalled();

    fireEvent.click(retry);

    await waitFor(() => {
      expect(generateWorkspaceImage).toHaveBeenCalledTimes(1);
    });

    expect(generateWorkspaceImage).toHaveBeenCalledWith(WORKSPACE_A, command);
  });

  it("blocks generation when a recovery record is invalid", async () => {
    sessionStorage.setItem(getPublishingRecoveryKey(scope), "{invalid-json");

    renderGenerator();

    expect(
      await screen.findByText("Generation recovery requires attention"),
    ).toBeTruthy();

    expect(generateWorkspaceImage).not.toHaveBeenCalled();

    expect(sessionStorage.getItem(getPublishingRecoveryKey(scope))).toBe(
      "{invalid-json",
    );
  });

  it("recovers an accepted generation after reopening", async () => {
    vi.mocked(generateWorkspaceImage).mockResolvedValue({
      assetId: ASSET_A,
      status: "pending",
      created: true,
      creditsChargedNow: 1,
    });

    const first = renderGenerator();

    await generate();

    await screen.findByText("Generation request accepted");

    first.unmount();

    renderGenerator();

    expect(await screen.findByText(/your image is ready/i)).toBeTruthy();

    // Reopening must not submit another POST.
    expect(generateWorkspaceImage).toHaveBeenCalledTimes(1);
  });
});
