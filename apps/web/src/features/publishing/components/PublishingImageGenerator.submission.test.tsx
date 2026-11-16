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

const WORKSPACE_A = "507f1f77bcf86cd799439011";
const WORKSPACE_B = "507f1f77bcf86cd799439012";
const ASSET_ID = "507f1f77bcf86cd799439022";
const USER_A = "11111111-2222-4333-8444-555555555555";

const PROMPT = "A premium coffee product photographed in a studio.";

vi.mock("@/lib/imageGeneration", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/imageGeneration")>();

  return {
    ...actual,
    getImageGenerationCredits: vi.fn(),
    generateWorkspaceImage: vi.fn(),
  };
});

function credits() {
  return {
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
  };
}

async function prepareGeneration() {
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
}

function deferred<T>() {
  let resolve!: (value: T) => void;

  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

beforeEach(() => {
  sessionStorage.clear();
  vi.resetAllMocks();

  vi.mocked(getImageGenerationCredits).mockResolvedValue(credits());
});

afterEach(() => {
  cleanup();
});

describe("Publishing image generation submission", () => {
  it("submits a valid immutable generation command", async () => {
    vi.mocked(generateWorkspaceImage).mockResolvedValue({
      assetId: ASSET_ID,
      status: "pending",
      created: true,
      creditsChargedNow: 1,
    });

    render(
      <PublishingImageGenerator
        ownerUserId={USER_A}
        workspaceId={WORKSPACE_A}
      />,
    );

    await prepareGeneration();

    fireEvent.click(
      screen.getByRole("button", {
        name: /generate image/i,
      }),
    );

    await waitFor(() => {
      expect(generateWorkspaceImage).toHaveBeenCalledTimes(1);
    });

    expect(generateWorkspaceImage).toHaveBeenCalledWith(
      WORKSPACE_A,
      expect.objectContaining({
        idempotencyKey: expect.any(String),
        image: {
          prompt: PROMPT,
          aspectRatio: "square",
          branding: {
            type: "none",
          },
        },
      }),
    );

    expect(await screen.findByText("Generation request accepted")).toBeTruthy();
  });

  it("retries an uncertain request with the same payload and key", async () => {
    vi.mocked(generateWorkspaceImage)
      .mockRejectedValueOnce(new Error("Connection lost"))
      .mockResolvedValueOnce({
        assetId: ASSET_ID,
        status: "pending",
        created: false,
        creditsChargedNow: 0,
      });

    render(
      <PublishingImageGenerator
        ownerUserId={USER_A}
        workspaceId={WORKSPACE_A}
      />,
    );

    await prepareGeneration();

    fireEvent.click(
      screen.getByRole("button", {
        name: /generate image/i,
      }),
    );

    const retryButton = await screen.findByRole("button", {
      name: /check \/ retry original request/i,
    });

    const firstCommand = vi.mocked(generateWorkspaceImage).mock.calls[0]?.[1];

    expect(firstCommand).toBeDefined();

    // Changing the form must not change the
    // already-submitted logical operation.
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Image prompt",
      }),
      {
        target: {
          value: "A beautiful landscape at golden hour.",
        },
      },
    );

    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(generateWorkspaceImage).toHaveBeenCalledTimes(2);
    });

    const secondCommand = vi.mocked(generateWorkspaceImage).mock.calls[1]?.[1];

    expect(secondCommand).toEqual(firstCommand);

    expect(secondCommand?.idempotencyKey).toBe(firstCommand?.idempotencyKey);
  });

  it("blocks a second generation while a request is pending", async () => {
    const pending =
      deferred<Awaited<ReturnType<typeof generateWorkspaceImage>>>();

    vi.mocked(generateWorkspaceImage).mockReturnValue(pending.promise);

    render(
      <PublishingImageGenerator
        ownerUserId={USER_A}
        workspaceId={WORKSPACE_A}
      />,
    );

    await prepareGeneration();

    fireEvent.click(
      screen.getByRole("button", {
        name: /generate image/i,
      }),
    );

    await waitFor(() => {
      expect(generateWorkspaceImage).toHaveBeenCalledTimes(1);
    });

    expect(
      screen.queryByRole("button", {
        name: /generate image/i,
      }),
    ).toBeNull();

    pending.resolve({
      assetId: ASSET_ID,
      status: "pending",
      created: true,
      creditsChargedNow: 1,
    });

    await screen.findByText("Generation request accepted");

    expect(generateWorkspaceImage).toHaveBeenCalledTimes(1);
  });

  it("does not create a second generation when retry is required", async () => {
    vi.mocked(generateWorkspaceImage).mockRejectedValue(
      new Error("Network timeout"),
    );

    render(
      <PublishingImageGenerator
        ownerUserId={USER_A}
        workspaceId={WORKSPACE_A}
      />,
    );

    await prepareGeneration();

    fireEvent.click(
      screen.getByRole("button", {
        name: /generate image/i,
      }),
    );

    await screen.findByText("Generation request requires verification");

    expect(
      screen.queryByRole("button", {
        name: /generate image/i,
      }),
    ).toBeNull();
  });

  it("ignores an old workspace's accepted response", async () => {
    const pending =
      deferred<Awaited<ReturnType<typeof generateWorkspaceImage>>>();

    vi.mocked(generateWorkspaceImage).mockReturnValue(pending.promise);

    const { rerender } = render(
      <PublishingImageGenerator
        ownerUserId={USER_A}
        workspaceId={WORKSPACE_A}
      />,
    );

    await prepareGeneration();

    fireEvent.click(
      screen.getByRole("button", {
        name: /generate image/i,
      }),
    );

    await waitFor(() => {
      expect(generateWorkspaceImage).toHaveBeenCalledTimes(1);
    });

    rerender(
      <PublishingImageGenerator
        ownerUserId={USER_A}
        workspaceId={WORKSPACE_B}
      />,
    );

    pending.resolve({
      assetId: ASSET_ID,
      status: "pending",
      created: true,
      creditsChargedNow: 1,
    });

    await waitFor(() => {
      expect(getImageGenerationCredits).toHaveBeenCalledWith(WORKSPACE_B);
    });

    expect(screen.queryByText("Generation request accepted")).toBeNull();
  });
});
