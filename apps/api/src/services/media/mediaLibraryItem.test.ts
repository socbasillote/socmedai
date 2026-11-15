import { beforeEach, describe, expect, it, vi } from "vitest";
import { getImageStorageKey } from "./supabaseImageStorage.js";
const mocks = vi.hoisted(() => ({
  findProfile: vi.fn(),
  findAsset: vi.fn(),
  findWorkspace: vi.fn(),
}));

vi.mock("../../models/UserProfile.js", () => ({
  default: {
    findOne: mocks.findProfile,
  },
}));

vi.mock("../../models/MediaAsset.js", () => ({
  default: {
    findOne: mocks.findAsset,
  },
}));

vi.mock("../../models/Workspace.js", () => ({
  default: {
    findOne: mocks.findWorkspace,
  },
}));

import { getAuthorizedMediaLibraryItem } from "./mediaLibraryService.js";

const PROFILE_ID = "507f1f77bcf86cd799439010";
const WORKSPACE_ID = "507f1f77bcf86cd799439011";
const ASSET_ID = "507f1f77bcf86cd799439012";

const authUser = {
  id: "test-user",
  email: null,
};

function queryResult(value: unknown) {
  return {
    select: () => ({
      lean: async () => value,
    }),
  };
}

describe("Authorized Media Library item", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.findProfile.mockReturnValue(queryResult({ _id: PROFILE_ID }));

    mocks.findAsset.mockReturnValue(
      queryResult({
        _id: ASSET_ID,
        workspaceId: WORKSPACE_ID,

        type: "image",
        source: "ai-generated",
        status: "ready",

        storageProvider: "supabase",
        storageKey: getImageStorageKey(WORKSPACE_ID, ASSET_ID),

        mimeType: "image/png",
        width: 1024,
        height: 1024,
        fileSize: 4096,

        idempotencyKey: "media-library-item-test-key",

        generationExecution: {
          phase: "storage_pending",
          attemptCount: 1,
        },

        contentSha256: "a".repeat(64),

        createdAt: new Date("2026-11-01T00:00:00.000Z"),
      }),
    );

    mocks.findWorkspace.mockReturnValue(
      queryResult({
        _id: WORKSPACE_ID,
        name: "Coffee Shop",
      }),
    );
  });

  it("returns authorized image metadata", async () => {
    const result = await getAuthorizedMediaLibraryItem(authUser, ASSET_ID);

    expect(result).toMatchObject({
      assetId: ASSET_ID,
      sourceWorkspaceId: WORKSPACE_ID,
      sourceWorkspaceName: "Coffee Shop",
      type: "image",
      mimeType: "image/png",
    });
  });

  it("requires the image to belong to the user", async () => {
    await getAuthorizedMediaLibraryItem(authUser, ASSET_ID);

    const query = mocks.findAsset.mock.calls[0][0];

    expect(query.createdByUserId).toBe(PROFILE_ID);
    expect(query.status).toBe("ready");
    expect(query.storageProvider).toBe("supabase");
  });

  it("reauthorizes the source workspace", async () => {
    await getAuthorizedMediaLibraryItem(authUser, ASSET_ID);

    expect(mocks.findWorkspace).toHaveBeenCalledWith({
      _id: WORKSPACE_ID,
      ownerUserId: PROFILE_ID,
    });
  });

  it("rejects an inaccessible source workspace", async () => {
    mocks.findWorkspace.mockReturnValue(queryResult(null));

    await expect(
      getAuthorizedMediaLibraryItem(authUser, ASSET_ID),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("rejects an unavailable image", async () => {
    mocks.findAsset.mockReturnValue(queryResult(null));

    await expect(
      getAuthorizedMediaLibraryItem(authUser, ASSET_ID),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(mocks.findWorkspace).not.toHaveBeenCalled();
  });

  it("rejects malformed asset IDs", async () => {
    await expect(
      getAuthorizedMediaLibraryItem(authUser, "invalid"),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(mocks.findAsset).not.toHaveBeenCalled();
  });

  it("does not expose private storage metadata", async () => {
    const result = await getAuthorizedMediaLibraryItem(authUser, ASSET_ID);

    expect(result).not.toHaveProperty("storageKey");
    expect(result).not.toHaveProperty("signedUrl");
    expect(result).not.toHaveProperty("generation");
  });
});
