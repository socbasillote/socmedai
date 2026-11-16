/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import {
  getImageGenerationCredits,
  type ImageGenerationCredits,
} from "@/lib/imageGeneration";

import { PublishingImageGenerator } from "./PublishingImageGenerator";

const WORKSPACE_A = "507f1f77bcf86cd799439011";
const WORKSPACE_B = "507f1f77bcf86cd799439012";

const USER_A = "11111111-2222-4333-8444-555555555555";

vi.mock("@/lib/imageGeneration", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/imageGeneration")>();

  return {
    ...actual,
    getImageGenerationCredits: vi.fn(),
  };
});

function makeCredits(
  available: number,
  attempts = 0,
  active = 0,
): ImageGenerationCredits {
  return {
    credits: {
      available,
      costPerImage: 1,
    },
    usage: {
      dayUtc: "2026-11-16",
      attempts,
      dailyLimit: 10,
      active,
      maxActive: 2,
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;

  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

const VALID_PROMPT = "A premium coffee product in a warm studio setting.";

beforeEach(() => {
  sessionStorage.clear();
  vi.resetAllMocks();

  vi.mocked(getImageGenerationCredits).mockResolvedValue(makeCredits(5));
});

afterEach(() => {
  cleanup();
});

describe("PublishingImageGenerator", () => {
  it("loads the selected workspace's credit balance", async () => {
    render(
      <PublishingImageGenerator
        ownerUserId={USER_A}
        workspaceId={WORKSPACE_A}
      />,
    );

    await waitFor(() => {
      expect(getImageGenerationCredits).toHaveBeenCalledWith(WORKSPACE_A);
    });

    expect(await screen.findByText("5")).toBeTruthy();
  });

  it("starts with square aspect ratio selected", async () => {
    render(
      <PublishingImageGenerator
        ownerUserId={USER_A}
        workspaceId={WORKSPACE_A}
      />,
    );

    await waitFor(() => {
      expect(getImageGenerationCredits).toHaveBeenCalledWith(WORKSPACE_A);

      expect(screen.getByText("5")).toBeTruthy();
    });

    const square = screen.getByRole<HTMLInputElement>("radio", {
      name: /square/i,
    });

    expect(square.checked).toBe(true);
  });

  it("allows changing to landscape", async () => {
    render(
      <PublishingImageGenerator
        ownerUserId={USER_A}
        workspaceId={WORKSPACE_A}
      />,
    );

    await screen.findByText("5");

    fireEvent.click(
      screen.getByRole("radio", {
        name: /landscape/i,
      }),
    );

    const landscape = screen.getByRole<HTMLInputElement>("radio", {
      name: /landscape/i,
    });

    expect(landscape.checked).toBe(true);
  });

  it("recognizes an eligible prompt with sufficient credits", async () => {
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
          value: VALID_PROMPT,
        },
      },
    );

    expect(await screen.findByText("Generation settings ready")).toBeTruthy();
  });

  it("rejects insufficient credits", async () => {
    vi.mocked(getImageGenerationCredits).mockResolvedValue(makeCredits(0));

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
          value: VALID_PROMPT,
        },
      },
    );

    expect(
      await screen.findByText(/does not have enough credits/i),
    ).toBeTruthy();

    expect(screen.getByText("Generation settings incomplete")).toBeTruthy();
  });

  it("rejects an exhausted daily generation limit", async () => {
    vi.mocked(getImageGenerationCredits).mockResolvedValue(makeCredits(5, 10));

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
          value: VALID_PROMPT,
        },
      },
    );

    expect(
      await screen.findByText(/reached an image generation limit/i),
    ).toBeTruthy();
  });

  it("ignores a stale credit response after a workspace switch", async () => {
    const previous = deferred<ImageGenerationCredits>();

    vi.mocked(getImageGenerationCredits)
      .mockImplementationOnce(() => previous.promise)
      .mockResolvedValueOnce(makeCredits(7));

    const { rerender } = render(
      <PublishingImageGenerator
        ownerUserId={USER_A}
        workspaceId={WORKSPACE_A}
      />,
    );

    rerender(
      <PublishingImageGenerator
        ownerUserId={USER_A}
        workspaceId={WORKSPACE_B}
      />,
    );

    expect(await screen.findByText("7")).toBeTruthy();

    await act(async () => {
      previous.resolve(makeCredits(99));
      await previous.promise;
    });

    expect(screen.queryByText("99")).toBeNull();
    expect(screen.getByText("7")).toBeTruthy();
  });
});
