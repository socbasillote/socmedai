import { defaultBrandKit, type BrandKit } from "@/lib/brandKit";
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

import { PublishingImageGenerator } from "./PublishingImageGenerator";

import { readPublishingRecovery } from "@/features/publishing/publishingImageRecovery";

const USER_ID = "11111111-2222-4333-8444-555555555555";

const WORKSPACE_ID = "507f1f77bcf86cd799439011";
const OTHER_WORKSPACE_ID = "507f1f77bcf86cd799439044";

const ASSET_ID = "507f1f77bcf86cd799439022";

const PROMPT = "A premium coffee product photographed in a studio.";

const scope = {
  ownerUserId: USER_ID,
  workspaceId: WORKSPACE_ID,
};

const mockLogo = vi.hoisted(() => ({
  brandKit: undefined as BrandKit | undefined,
  status: "available",
  available: true,

  otherWorkspaceStatus: "loading",
  otherWorkspaceAvailable: false,
}));

vi.mock("@/features/image-studio/hooks/useWorkspaceLogoAvailability", () => ({
  useWorkspaceLogoAvailability: (workspaceId: string | null) => {
    const isOtherWorkspace = workspaceId === "507f1f77bcf86cd799439044";

    return {
      status: isOtherWorkspace
        ? mockLogo.otherWorkspaceStatus
        : mockLogo.status,

      logoAvailable: isOtherWorkspace
        ? mockLogo.otherWorkspaceAvailable
        : mockLogo.available,

      refresh: vi.fn(),
      brandKit: mockLogo.brandKit,
    };
  },
}));

vi.mock("@/features/image-studio/components/WorkspaceLogoUploader", () => ({
  WorkspaceLogoUploader: () => null,
}));

vi.mock("@/features/image-studio/components/BrandingPlacementPreview", () => ({
  BrandingPlacementPreview: () => null,
}));

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

async function enterPrompt() {
  fireEvent.change(
    screen.getByRole("textbox", {
      name: "Image prompt",
    }),
    {
      target: { value: PROMPT },
    },
  );
}

async function clickGenerate() {
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

  mockLogo.otherWorkspaceStatus = "loading";
  mockLogo.otherWorkspaceAvailable = false;

  mockLogo.brandKit = undefined;
  mockLogo.status = "available";
  mockLogo.available = true;

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
    url: "https://example.test/branded-preview",
    expiresIn: 60,
  });
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe("Publishing branded generation", () => {
  it("submits the selected text branding", async () => {
    renderGenerator();

    await enterPrompt();

    // 1. Select text branding.
    fireEvent.click(
      screen.getByRole("radio", {
        name: "Text label",
      }),
    );

    // 2. Configure branding before generation.
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Branding text",
      }),
      {
        target: { value: "BREW CO." },
      },
    );

    fireEvent.change(screen.getByLabelText("Branding position"), {
      target: { value: "top-left" },
    });

    fireEvent.change(screen.getByLabelText(/branding size/i), {
      target: { value: "15" },
    });

    fireEvent.change(screen.getByLabelText(/branding opacity/i), {
      target: { value: "60" },
    });

    // 3. Submit the generation request.
    await clickGenerate();

    // 4. Verify the API received the branded command.
    await waitFor(() => {
      expect(generateWorkspaceImage).toHaveBeenCalledTimes(1);
    });

    const command = vi.mocked(generateWorkspaceImage).mock.calls[0][1];

    expect(command.image.branding).toEqual({
      type: "text",
      text: "BREW CO.",
      position: "top-left",
      sizePercent: 15,
      opacity: 0.6,
    });

    expect(command.idempotencyKey).toBeTruthy();

    // 5. Only AFTER generation is accepted and the
    // status endpoint reports ready should the
    // private image preview appear.
    await screen.findByRole("img", {
      name: "AI-generated image preview",
    });
  });

  it("submits a verified workspace logo", async () => {
    renderGenerator();

    await enterPrompt();

    fireEvent.click(
      screen.getByRole("radio", {
        name: "Workspace logo",
      }),
    );

    await clickGenerate();

    await waitFor(() => {
      expect(generateWorkspaceImage).toHaveBeenCalledTimes(1);
    });

    const command = vi.mocked(generateWorkspaceImage).mock.calls[0][1];

    expect(command.image.branding).toEqual({
      type: "logo",
      position: "bottom-right",
      sizePercent: 20,
      opacity: 0.8,
    });

    await screen.findByRole("img", {
      name: "AI-generated image preview",
    });
  });

  it("blocks logo generation when availability is unverified", async () => {
    mockLogo.status = "loading";
    mockLogo.available = false;

    renderGenerator();

    await enterPrompt();

    fireEvent.click(
      screen.getByRole("radio", {
        name: "Workspace logo",
      }),
    );

    await screen.findByText("5");

    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: /generate image/i })
        .disabled,
    ).toBe(true);

    expect(generateWorkspaceImage).not.toHaveBeenCalled();
  });

  it("restores exact text branding after an uncertain response", async () => {
    vi.mocked(generateWorkspaceImage)
      .mockRejectedValueOnce(new Error("Network response was lost."))
      .mockResolvedValueOnce({
        assetId: ASSET_ID,
        status: "pending",
        created: false,
        creditsChargedNow: 0,
      });

    const first = renderGenerator();

    await enterPrompt();

    fireEvent.click(
      screen.getByRole("radio", {
        name: "Text label",
      }),
    );

    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Branding text",
      }),
      { target: { value: "ORIGINAL BRAND" } },
    );

    await clickGenerate();

    await waitFor(() => {
      expect(generateWorkspaceImage).toHaveBeenCalledTimes(1);
    });

    const firstCommand = vi.mocked(generateWorkspaceImage).mock.calls[0][1];

    const recovery = readPublishingRecovery(sessionStorage, scope);

    expect(recovery.status).toBe("found");

    if (recovery.status !== "found" || recovery.record.state !== "uncertain") {
      throw new Error("Missing uncertain recovery.");
    }

    expect(recovery.record.command).toEqual(firstCommand);

    first.unmount();

    renderGenerator();

    const retry = await screen.findByRole("button", {
      name: /check \/ retry original request/i,
    });

    // Reopening does not create a new request.
    expect(generateWorkspaceImage).toHaveBeenCalledTimes(1);

    fireEvent.click(retry);

    await waitFor(() => {
      expect(generateWorkspaceImage).toHaveBeenCalledTimes(2);
    });

    const retryCommand = vi.mocked(generateWorkspaceImage).mock.calls[1][1];

    expect(retryCommand).toEqual(firstCommand);

    expect(retryCommand.idempotencyKey).toBe(firstCommand.idempotencyKey);

    expect(retryCommand.image.branding).toEqual(firstCommand.image.branding);
  });

  it("removes text branding when switching to no branding", async () => {
    renderGenerator();

    await enterPrompt();

    fireEvent.click(
      screen.getByRole("radio", {
        name: "Text label",
      }),
    );

    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Branding text",
      }),
      {
        target: { value: "BREW CO." },
      },
    );

    fireEvent.click(
      screen.getByRole("radio", {
        name: "No branding",
      }),
    );

    expect(
      screen.queryByRole("textbox", {
        name: "Branding text",
      }),
    ).toBeNull();

    await clickGenerate();

    await waitFor(() => {
      expect(generateWorkspaceImage).toHaveBeenCalledTimes(1);
    });

    const command = vi.mocked(generateWorkspaceImage).mock.calls[0][1];

    expect(command.image.branding).toEqual({
      type: "none",
    });

    await screen.findByRole("img", {
      name: "AI-generated image preview",
    });
  });

  it("replaces logo branding when switching to text", async () => {
    renderGenerator();

    await enterPrompt();

    fireEvent.click(
      screen.getByRole("radio", {
        name: "Workspace logo",
      }),
    );

    fireEvent.click(
      screen.getByRole("radio", {
        name: "Text label",
      }),
    );

    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Branding text",
      }),
      {
        target: { value: "STORM COFFEE" },
      },
    );

    await clickGenerate();

    await waitFor(() => {
      expect(generateWorkspaceImage).toHaveBeenCalledTimes(1);
    });

    const command = vi.mocked(generateWorkspaceImage).mock.calls[0][1];

    expect(command.image.branding).toEqual({
      type: "text",
      text: "STORM COFFEE",
      position: "bottom-right",
      sizePercent: 20,
      opacity: 0.8,
    });

    expect(command.image.branding?.type).not.toBe("logo");

    await screen.findByRole("img", {
      name: "AI-generated image preview",
    });
  });

  it("invalidates logo verification when switching workspaces", async () => {
    const view = renderGenerator();

    await enterPrompt();

    fireEvent.click(
      screen.getByRole("radio", {
        name: "Workspace logo",
      }),
    );

    // Workspace A has a verified logo.
    await waitFor(() => {
      expect(
        screen.getByRole<HTMLButtonElement>("button", {
          name: /generate image/i,
        }).disabled,
      ).toBe(false);
    });

    // Switch to Workspace B, where logo
    // availability has not been verified.
    view.rerender(
      <PublishingImageGenerator
        ownerUserId={USER_ID}
        workspaceId={OTHER_WORKSPACE_ID}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("radio", {
          name: "No branding",
        }) as HTMLInputElement,
      ).toHaveProperty("checked", true);
    });

    // Branding is reset. Selecting the new
    // workspace's unverified logo must not
    // authorize image generation.
    fireEvent.click(
      screen.getByRole("radio", {
        name: "Workspace logo",
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole<HTMLButtonElement>("button", {
          name: /generate image/i,
        }).disabled,
      ).toBe(true);
    });

    expect(generateWorkspaceImage).not.toHaveBeenCalled();
  });
});

it("starts with the brand-kit logo position and preserves per-image changes", async () => {
  mockLogo.brandKit = { ...structuredClone(defaultBrandKit), layout: { ...defaultBrandKit.layout, logoPosition: "top-left" } };
  const view = renderGenerator();
  fireEvent.click(screen.getByRole("radio", { name: "Workspace logo" }));
  expect(screen.getByLabelText("Branding position")).toHaveValue("top-left");
  fireEvent.change(screen.getByLabelText("Branding position"), { target: { value: "bottom-left" } });
  mockLogo.brandKit.layout.logoPosition = "top-right";
  view.rerender(<PublishingImageGenerator ownerUserId={USER_ID} workspaceId={WORKSPACE_ID} />);
  expect(screen.getByLabelText("Branding position")).toHaveValue("bottom-left");
});
it("does not replace a position chosen before the brand kit finishes loading", () => {
  const view = renderGenerator();
  fireEvent.click(screen.getByRole("radio", { name: "Workspace logo" }));
  fireEvent.change(screen.getByLabelText("Branding position"), { target: { value: "bottom-left" } });
  mockLogo.brandKit = { ...structuredClone(defaultBrandKit), layout: { ...defaultBrandKit.layout, logoPosition: "top-left" } };
  view.rerender(<PublishingImageGenerator ownerUserId={USER_ID} workspaceId={WORKSPACE_ID} />);
  expect(screen.getByLabelText("Branding position")).toHaveValue("bottom-left");
});
