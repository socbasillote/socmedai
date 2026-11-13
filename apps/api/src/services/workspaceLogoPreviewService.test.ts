import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getWorkspaceLogoSettings,
  WorkspaceLogoServiceError,
} from "./workspaceLogoService.js";

import {
  createWorkspaceLogoPreview,
  type WorkspaceLogoPreviewSigner,
} from "./workspaceLogoPreviewService.js";

vi.mock("./workspaceLogoService.js", () => ({
  getWorkspaceLogoSettings: vi.fn(),
  WorkspaceLogoServiceError: class WorkspaceLogoServiceError extends Error {
    constructor(
      message: string,
      public readonly statusCode: number,
    ) {
      super(message);
      this.name = "WorkspaceLogoServiceError";
    }
  },
}));

const WORKSPACE_ID = "507f1f77bcf86cd799439011";
const LOGO_ID = "507f1f77bcf86cd799439012";

const STORAGE_KEY = `workspaces/${WORKSPACE_ID}/logos/${LOGO_ID}.png`;

const authUser = {
  id: "test-auth-user",
} as Parameters<typeof createWorkspaceLogoPreview>[0];

const settings = {
  enabled: true,
  logo: {
    storageKey: STORAGE_KEY,
    sha256: "a".repeat(64),
  },
  position: "bottom-right" as const,
  sizePercent: 20,
  opacity: 0.8,
};

function createSigner() {
  const createSignedUrl =
    vi.fn<WorkspaceLogoPreviewSigner["createSignedUrl"]>();

  createSignedUrl.mockResolvedValue({
    data: {
      signedUrl: "https://storage.example.test/private-signed-image",
    },
    error: null,
  });

  return {
    createSignedUrl,
  };
}

describe("workspace logo preview authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("signs the current authorized logo for 60 seconds", async () => {
    vi.mocked(getWorkspaceLogoSettings).mockResolvedValue(settings);

    const signer = createSigner();

    const result = await createWorkspaceLogoPreview(
      authUser,
      WORKSPACE_ID,
      signer,
    );

    expect(getWorkspaceLogoSettings).toHaveBeenCalledWith(
      authUser,
      WORKSPACE_ID,
    );

    expect(signer.createSignedUrl).toHaveBeenCalledExactlyOnceWith(
      STORAGE_KEY,
      60,
    );

    expect(result).toEqual({
      url: "https://storage.example.test/private-signed-image",
      expiresIn: 60,
    });
  });

  it("does not sign an unauthorized workspace logo", async () => {
    vi.mocked(getWorkspaceLogoSettings).mockRejectedValue(
      new WorkspaceLogoServiceError("Workspace not found.", 404),
    );

    const signer = createSigner();

    await expect(
      createWorkspaceLogoPreview(authUser, WORKSPACE_ID, signer),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(signer.createSignedUrl).not.toHaveBeenCalled();
  });

  it("rejects a workspace without an uploaded logo", async () => {
    vi.mocked(getWorkspaceLogoSettings).mockResolvedValue({
      ...settings,
      enabled: false,
      logo: null,
    });

    const signer = createSigner();

    await expect(
      createWorkspaceLogoPreview(authUser, WORKSPACE_ID, signer),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(signer.createSignedUrl).not.toHaveBeenCalled();
  });

  it("allows previewing an uploaded but disabled logo", async () => {
    vi.mocked(getWorkspaceLogoSettings).mockResolvedValue({
      ...settings,
      enabled: false,
    });

    const signer = createSigner();

    const result = await createWorkspaceLogoPreview(
      authUser,
      WORKSPACE_ID,
      signer,
    );

    expect(result.expiresIn).toBe(60);

    expect(signer.createSignedUrl).toHaveBeenCalledExactlyOnceWith(
      STORAGE_KEY,
      60,
    );
  });

  it("returns 503 when Supabase signing fails", async () => {
    vi.mocked(getWorkspaceLogoSettings).mockResolvedValue(settings);

    const signer = createSigner();

    signer.createSignedUrl.mockResolvedValue({
      data: null,
      error: {
        message: "Internal signing failure",
      },
    });

    await expect(
      createWorkspaceLogoPreview(authUser, WORKSPACE_ID, signer),
    ).rejects.toMatchObject({
      statusCode: 503,
      message: "Workspace logo preview is temporarily unavailable.",
    });

    expect(signer.createSignedUrl).toHaveBeenCalledTimes(1);
  });

  it("does not expose provider errors", async () => {
    vi.mocked(getWorkspaceLogoSettings).mockResolvedValue(settings);

    const signer = createSigner();

    signer.createSignedUrl.mockRejectedValue(
      new Error("Sensitive provider diagnostic"),
    );

    await expect(
      createWorkspaceLogoPreview(authUser, WORKSPACE_ID, signer),
    ).rejects.toMatchObject({
      statusCode: 503,
      message: "Workspace logo preview is temporarily unavailable.",
    });
  });
});
