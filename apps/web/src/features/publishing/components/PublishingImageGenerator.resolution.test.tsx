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

import {
  createAcceptedRecovery,
  createUncertainRecovery,
  getPublishingRecoveryKey,
  readPublishingRecovery,
  savePublishingRecovery,
} from "@/features/publishing/publishingImageRecovery";

import { PublishingImageGenerator } from "./PublishingImageGenerator";

const USER_ID = "11111111-2222-4333-8444-555555555555";

const WORKSPACE_ID = "507f1f77bcf86cd799439011";

const ASSET_ID = "507f1f77bcf86cd799439022";

const OTHER_ASSET_ID = "507f1f77bcf86cd799439033";

const PROMPT = "A premium coffee product photographed in a studio.";

const scope = {
  ownerUserId: USER_ID,
  workspaceId: WORKSPACE_ID,
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
    <PublishingImageGenerator
      ownerUserId={USER_ID}
      workspaceId={WORKSPACE_ID}
    />,
  );
}

async function restoreReadyGeneration() {
  savePublishingRecovery(
    sessionStorage,
    scope,
    createAcceptedRecovery(scope, ASSET_ID),
  );

  renderGenerator();

  await screen.findByRole("img", {
    name: "AI-generated image preview",
  });

  return screen.getByRole<HTMLButtonElement>("button", {
    name: "Finish Image & Generate Another",
  });
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
    url: "https://example.test/private-ready-image",
    expiresIn: 60,
  });
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe("Publishing generation recovery resolution", () => {
  it("clears a verified ready generation explicitly", async () => {
    const button = await restoreReadyGeneration();

    expect(readPublishingRecovery(sessionStorage, scope).status).toBe("found");

    fireEvent.click(button);

    expect(readPublishingRecovery(sessionStorage, scope).status).toBe("empty");

    expect(
      screen.queryByRole("img", {
        name: "AI-generated image preview",
      }),
    ).toBeNull();

    // Resolution is local recovery cleanup,
    // not a new generation POST.
    expect(generateWorkspaceImage).not.toHaveBeenCalled();
  });

  it("allows another generation only after resolution", async () => {
    const button = await restoreReadyGeneration();

    expect(
      screen.queryByRole("button", {
        name: /generate image ·/i,
      }),
    ).toBeNull();

    fireEvent.click(button);

    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Image prompt",
      }),
      { target: { value: PROMPT } },
    );

    await waitFor(() => {
      expect(
        screen.getByRole<HTMLButtonElement>("button", {
          name: /generate image ·/i,
        }).disabled,
      ).toBe(false);
    });

    // We deliberately do not click Generate here.
    // A new request still requires explicit action.
    expect(generateWorkspaceImage).not.toHaveBeenCalled();
  });

  it("does not clear an uncertain recovery record", async () => {
    const command = {
      idempotencyKey: "11111111-2222-4333-8444-555555555555",
      image: {
        prompt: PROMPT,
        aspectRatio: "square" as const,
        branding: { type: "none" as const },
      },
    };

    savePublishingRecovery(
      sessionStorage,
      scope,
      createUncertainRecovery(scope, command),
    );

    renderGenerator();

    await screen.findByRole("button", {
      name: /check \/ retry original request/i,
    });

    expect(
      screen.queryByRole("button", {
        name: "Finish Image & Generate Another",
      }),
    ).toBeNull();

    expect(readPublishingRecovery(sessionStorage, scope).status).toBe("found");

    expect(generateWorkspaceImage).not.toHaveBeenCalled();
  });

  it("refuses to clear a different accepted asset", async () => {
    const button = await restoreReadyGeneration();

    // Simulate another operation changing the
    // stored recovery identity.
    savePublishingRecovery(
      sessionStorage,
      scope,
      createAcceptedRecovery(scope, OTHER_ASSET_ID),
    );

    fireEvent.click(button);

    expect(
      await screen.findByText("Generation recovery requires attention"),
    ).toBeTruthy();

    const recovery = readPublishingRecovery(sessionStorage, scope);

    expect(recovery.status).toBe("found");

    if (recovery.status === "found" && recovery.record.state === "accepted") {
      expect(recovery.record.assetId).toBe(OTHER_ASSET_ID);
    }

    expect(generateWorkspaceImage).not.toHaveBeenCalled();
  });

  it("never deletes an invalid recovery record", async () => {
    const button = await restoreReadyGeneration();

    sessionStorage.setItem(getPublishingRecoveryKey(scope), "{invalid-json");

    fireEvent.click(button);

    expect(sessionStorage.getItem(getPublishingRecoveryKey(scope))).toBe(
      "{invalid-json",
    );

    expect(
      await screen.findByText("Generation recovery requires attention"),
    ).toBeTruthy();

    expect(generateWorkspaceImage).not.toHaveBeenCalled();
  });
});
