import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPrivateImageAccessUrl,
  IMAGE_URL_EXPIRY_SECONDS,
  type ImageUrlSigner,
} from "./mediaImageAccessService.js";

import { getWorkspaceMediaAsset } from "../mediaAssetService.js";

vi.mock("../mediaAssetService.js", () => ({
  getWorkspaceMediaAsset: vi.fn(),
}));

const workspaceId = "507f1f77bcf86cd799439011";

const assetId = "507f1f77bcf86cd799439022";

const expectedKey = `workspaces/${workspaceId}/images/${assetId}.png`;

const authUser = {
  id: "test-user",
};

const validAsset = {
  _id: assetId,
  status: "ready",
  type: "image",
  source: "ai-generated",
  idempotencyKey: "original-request-key",
  generationExecution: {
    phase: "completed",
  },
  storageProvider: "supabase",
  storageKey: expectedKey,
  mimeType: "image/png",
  contentSha256: "a".repeat(64),
};

function mockAsset(asset: unknown) {
  vi.mocked(getWorkspaceMediaAsset).mockResolvedValue(
    asset as Awaited<ReturnType<typeof getWorkspaceMediaAsset>>,
  );
}

function makeSigner() {
  const createSignedUrl = vi.fn<ImageUrlSigner["createSignedUrl"]>();

  createSignedUrl.mockResolvedValue({
    data: {
      signedUrl: "https://storage.example.test/private-image-token",
    },
    error: null,
  });

  return {
    createSignedUrl,
  };
}

describe("Private image signed URL authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("signs an authorized ready image for 60 seconds", async () => {
    mockAsset(validAsset);

    const signer = makeSigner();

    const result = await createPrivateImageAccessUrl(
      authUser,
      workspaceId,
      assetId,
      signer,
    );

    expect(signer.createSignedUrl).toHaveBeenCalledWith(
      expectedKey,
      IMAGE_URL_EXPIRY_SECONDS,
    );

    expect(result).toEqual({
      assetId,
      url: "https://storage.example.test/private-image-token",
      expiresIn: 60,
    });

    expect(result).not.toHaveProperty("storageKey");
    expect(result).not.toHaveProperty("contentSha256");
  });

  it("does not sign an unauthorized image", async () => {
    vi.mocked(getWorkspaceMediaAsset).mockRejectedValue(
      Object.assign(new Error("Resource not found."), {
        statusCode: 404,
      }),
    );

    const signer = makeSigner();

    await expect(
      createPrivateImageAccessUrl(authUser, workspaceId, assetId, signer),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(signer.createSignedUrl).not.toHaveBeenCalled();
  });

  it("does not sign an image with the wrong storage key", async () => {
    mockAsset({
      ...validAsset,
      storageKey:
        "workspaces/507f1f77bcf86cd799439099/images/" + `${assetId}.png`,
    });

    const signer = makeSigner();

    await expect(
      createPrivateImageAccessUrl(authUser, workspaceId, assetId, signer),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(signer.createSignedUrl).not.toHaveBeenCalled();
  });

  it("does not sign an unfinished image", async () => {
    mockAsset({
      ...validAsset,
      status: "pending",
    });

    const signer = makeSigner();

    await expect(
      createPrivateImageAccessUrl(authUser, workspaceId, assetId, signer),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(signer.createSignedUrl).not.toHaveBeenCalled();
  });

  it("rejects signed URL provider failures", async () => {
    mockAsset(validAsset);

    const signer = makeSigner();

    signer.createSignedUrl.mockResolvedValue({
      data: null,
      error: {
        message: "Storage unavailable",
      },
    });

    await expect(
      createPrivateImageAccessUrl(authUser, workspaceId, assetId, signer),
    ).rejects.toMatchObject({
      statusCode: 503,
    });

    expect(signer.createSignedUrl).toHaveBeenCalledTimes(1);
  });
});
