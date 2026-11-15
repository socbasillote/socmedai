import { beforeEach, describe, expect, it, vi } from "vitest";
import { getImageStorageKey } from "./supabaseImageStorage.js";

const mocks = vi.hoisted(() => ({
  findProfile: vi.fn(),
  findWorkspace: vi.fn(),
  findAssets: vi.fn(),
}));

vi.mock("../../models/UserProfile.js", () => ({
  default: {
    findOne: mocks.findProfile,
  },
}));

vi.mock("../../models/Workspace.js", () => ({
  default: {
    findOne: mocks.findWorkspace,
    find: mocks.findWorkspace,
  },
}));

vi.mock("../../models/MediaAsset.js", () => ({
  default: {
    find: mocks.findAssets,
  },
}));

import {
  DraftMediaAttachmentError,
  validateDraftMediaAttachments,
} from "./validateDraftMediaAttachments.js";

const USER_ID = "test-user";
const PROFILE_ID = "507f1f77bcf86cd799439010";
const WORKSPACE_A = "507f1f77bcf86cd799439011";
const WORKSPACE_B = "507f1f77bcf86cd799439012";
const ASSET_A = "507f1f77bcf86cd799439013";
const ASSET_B = "507f1f77bcf86cd799439014";

const authUser = {
  id: USER_ID,
  email: null,
};

function readyImage(assetId: string, workspaceId: string) {
  return {
    _id: assetId,
    workspaceId,

    type: "image",
    source: "ai-generated",
    status: "ready",

    storageProvider: "supabase",
    storageKey: getImageStorageKey(workspaceId, assetId),

    mimeType: "image/png",
    width: 1024,
    height: 1024,
    fileSize: 4096,

    idempotencyKey: "draft-media-attachment-test-key",

    generationExecution: {
      phase: "storage_pending",
      attemptCount: 1,
    },

    contentSha256: "a".repeat(64),
  };
}

function queryResult(value: unknown) {
  return {
    select: () => ({
      lean: async () => value,
    }),
  };
}

describe("validateDraftMediaAttachments", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.findProfile.mockReturnValue(queryResult({ _id: PROFILE_ID }));

    mocks.findWorkspace.mockImplementation(
      (filter: Record<string, unknown>) => {
        if ("_id" in filter) {
          return queryResult({
            _id: WORKSPACE_B,
          });
        }

        return queryResult([{ _id: WORKSPACE_A }, { _id: WORKSPACE_B }]);
      },
    );

    mocks.findAssets.mockReturnValue(
      queryResult([
        readyImage(ASSET_A, WORKSPACE_A),
        readyImage(ASSET_B, WORKSPACE_B),
      ]),
    );
  });

  it("allows assets from another owned workspace", async () => {
    const result = await validateDraftMediaAttachments({
      authUser,
      destinationWorkspaceId: WORKSPACE_B,
      mediaIds: [ASSET_A, ASSET_B],
    });

    expect(result).toEqual([ASSET_A, ASSET_B]);

    const query = mocks.findAssets.mock.calls[0][0];

    expect(query.createdByUserId).toBe(PROFILE_ID);
    expect(query.status).toBe("ready");
    expect(query.workspaceId.$in).toEqual([WORKSPACE_A, WORKSPACE_B]);
  });

  it("rejects duplicate attachment IDs", async () => {
    await expect(
      validateDraftMediaAttachments({
        authUser,
        destinationWorkspaceId: WORKSPACE_B,
        mediaIds: [ASSET_A, ASSET_A],
      }),
    ).rejects.toBeInstanceOf(DraftMediaAttachmentError);

    expect(mocks.findAssets).not.toHaveBeenCalled();
  });

  it("rejects an unauthorized destination workspace", async () => {
    mocks.findWorkspace.mockReturnValue(queryResult(null));

    await expect(
      validateDraftMediaAttachments({
        authUser,
        destinationWorkspaceId: WORKSPACE_B,
        mediaIds: [ASSET_A],
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(mocks.findAssets).not.toHaveBeenCalled();
  });

  it("rejects inaccessible or incomplete assets", async () => {
    mocks.findAssets.mockReturnValue(
      queryResult([readyImage(ASSET_A, WORKSPACE_A)]),
    );

    await expect(
      validateDraftMediaAttachments({
        authUser,
        destinationWorkspaceId: WORKSPACE_B,
        mediaIds: [ASSET_A, ASSET_B],
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "One or more media attachments are unavailable.",
    });
  });

  it("allows an empty attachment list", async () => {
    const result = await validateDraftMediaAttachments({
      authUser,
      destinationWorkspaceId: WORKSPACE_B,
      mediaIds: [],
    });

    expect(result).toEqual([]);
    expect(mocks.findAssets).not.toHaveBeenCalled();
  });

  it("rejects more than 20 attachments", async () => {
    const ids = Array.from(
      { length: 21 },
      (_, index) => `507f1f77bcf86cd79943${String(index).padStart(4, "0")}`,
    );

    await expect(
      validateDraftMediaAttachments({
        authUser,
        destinationWorkspaceId: WORKSPACE_B,
        mediaIds: ids,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("rejects malformed media IDs", async () => {
    await expect(
      validateDraftMediaAttachments({
        authUser,
        destinationWorkspaceId: WORKSPACE_B,
        mediaIds: ["not-an-object-id"],
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("rejects an image with an incorrect storage key", async () => {
    mocks.findAssets.mockReturnValue(
      queryResult([
        {
          ...readyImage(ASSET_A, WORKSPACE_A),
          storageKey: "wrong/private/path.png",
        },
      ]),
    );

    await expect(
      validateDraftMediaAttachments({
        authUser,
        destinationWorkspaceId: WORKSPACE_B,
        mediaIds: [ASSET_A],
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "One or more media attachments are unavailable.",
    });
  });

  it("rejects missing generation verification", async () => {
    mocks.findAssets.mockReturnValue(
      queryResult([
        {
          ...readyImage(ASSET_A, WORKSPACE_A),
          contentSha256: undefined,
        },
      ]),
    );

    await expect(
      validateDraftMediaAttachments({
        authUser,
        destinationWorkspaceId: WORKSPACE_B,
        mediaIds: [ASSET_A],
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("rejects incomplete image dimensions", async () => {
    mocks.findAssets.mockReturnValue(
      queryResult([
        {
          ...readyImage(ASSET_A, WORKSPACE_A),
          width: 0,
        },
      ]),
    );

    await expect(
      validateDraftMediaAttachments({
        authUser,
        destinationWorkspaceId: WORKSPACE_B,
        mediaIds: [ASSET_A],
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
