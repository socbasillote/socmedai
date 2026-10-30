import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "../userProfileService.js";

import {
  getFacebookPublishingCredentials,
  FacebookPublishingCredentialsError,
} from "./facebookPublishingTokenService.js";

/**
 * Shared mocks.
 *
 * No real MongoDB connection, decryption,
 * or Facebook API requests are performed.
 */
const mocks = vi.hoisted(() => ({
  isValidWorkspaceId: vi.fn(),
  getUserWorkspaceById: vi.fn(),

  findOne: vi.fn(),
  select: vi.fn(),
  lean: vi.fn(),

  decryptFacebookToken: vi.fn(),
}));

vi.mock("../workspaceService.js", () => ({
  isValidWorkspaceId: mocks.isValidWorkspaceId,
  getUserWorkspaceById: mocks.getUserWorkspaceById,
}));

vi.mock("../../models/FacebookConnection.js", () => ({
  default: {
    findOne: mocks.findOne,
  },
}));

vi.mock("./facebookTokenEncryptionService.js", () => ({
  decryptFacebookToken: mocks.decryptFacebookToken,
}));

const WORKSPACE_ID = "507f1f77bcf86cd799439011";

const CONNECTION_ID = "507f1f77bcf86cd799439013";

const PAGE_ID = "123456789";

const ENCRYPTED_TOKEN = "encrypted-test-page-token";

const DECRYPTED_TOKEN = "decrypted-test-page-token";

const AUTH_USER = {
  id: "test-supabase-user",
} as AuthenticatedUser;

const VALID_INPUT = {
  authUser: AUTH_USER,
  workspaceId: WORKSPACE_ID,
  connectionId: CONNECTION_ID,
};

function connectionFixture(overrides: Record<string, unknown> = {}) {
  return {
    _id: CONNECTION_ID,
    workspaceId: WORKSPACE_ID,
    facebookPageId: PAGE_ID,
    status: "connected",
    tasks: ["CREATE_CONTENT", "MANAGE"],
    pageAccessTokenEncrypted: ENCRYPTED_TOKEN,
    ...overrides,
  };
}

describe("getFacebookPublishingCredentials", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.isValidWorkspaceId.mockReturnValue(true);

    mocks.getUserWorkspaceById.mockResolvedValue({
      _id: WORKSPACE_ID,
      name: "Storm Marketing",
    });

    mocks.findOne.mockReturnValue({
      select: mocks.select,
    });

    mocks.select.mockReturnValue({
      lean: mocks.lean,
    });

    mocks.lean.mockResolvedValue(connectionFixture());

    mocks.decryptFacebookToken.mockReturnValue(DECRYPTED_TOKEN);
  });

  /**
   * Test 1:
   * Retrieve credentials for an authorized Page.
   */
  it("returns authorized Facebook publishing credentials", async () => {
    const result = await getFacebookPublishingCredentials(VALID_INPUT);

    expect(result).toEqual({
      connectionId: CONNECTION_ID,
      facebookPageId: PAGE_ID,
      pageAccessToken: DECRYPTED_TOKEN,
    });

    expect(mocks.decryptFacebookToken).toHaveBeenCalledWith(ENCRYPTED_TOKEN);

    expect(result).not.toHaveProperty("pageAccessTokenEncrypted");

    expect(JSON.stringify(result)).not.toContain(ENCRYPTED_TOKEN);
  });

  /**
   * Test 2:
   * Reject unauthenticated requests before querying.
   */
  it("rejects unauthenticated users", async () => {
    await expect(
      getFacebookPublishingCredentials({
        ...VALID_INPUT,
        authUser: {
          id: "",
        } as AuthenticatedUser,
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "Authentication is required.",
    });

    expect(mocks.findOne).not.toHaveBeenCalled();

    expect(mocks.decryptFacebookToken).not.toHaveBeenCalled();
  });

  /**
   * Test 3:
   * Reject invalid workspace IDs.
   */
  it("rejects invalid workspace IDs", async () => {
    mocks.isValidWorkspaceId.mockReturnValue(false);

    await expect(
      getFacebookPublishingCredentials({
        ...VALID_INPUT,
        workspaceId: "invalid-workspace",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "A valid workspace is required.",
    });

    expect(mocks.getUserWorkspaceById).not.toHaveBeenCalled();

    expect(mocks.findOne).not.toHaveBeenCalled();
  });

  /**
   * Test 4:
   * Reject invalid connection IDs.
   */
  it("rejects invalid Facebook connection IDs", async () => {
    await expect(
      getFacebookPublishingCredentials({
        ...VALID_INPUT,
        connectionId: "invalid-connection",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "A valid Facebook connection is required.",
    });

    expect(mocks.findOne).not.toHaveBeenCalled();
  });

  /**
   * Test 5:
   * Deny access to an inaccessible workspace.
   */
  it("rejects inaccessible workspaces", async () => {
    mocks.getUserWorkspaceById.mockResolvedValue(null);

    await expect(
      getFacebookPublishingCredentials(VALID_INPUT),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Workspace not found.",
    });

    expect(mocks.getUserWorkspaceById).toHaveBeenCalledWith(
      AUTH_USER,
      WORKSPACE_ID,
    );

    expect(mocks.findOne).not.toHaveBeenCalled();
  });

  /**
   * Test 6:
   * Query credentials only within the authorized workspace.
   */
  it("restricts credential retrieval to the authorized workspace", async () => {
    await getFacebookPublishingCredentials(VALID_INPUT);

    expect(mocks.findOne).toHaveBeenCalledWith({
      _id: CONNECTION_ID,
      workspaceId: WORKSPACE_ID,
    });

    expect(mocks.select).toHaveBeenCalledWith(
      "_id facebookPageId status tasks +pageAccessTokenEncrypted",
    );

    expect(mocks.lean).toHaveBeenCalledTimes(1);
  });

  /**
   * Test 7:
   * Reject nonexistent or cross-workspace connections.
   */
  it("rejects missing Facebook connections", async () => {
    mocks.lean.mockResolvedValue(null);

    await expect(
      getFacebookPublishingCredentials(VALID_INPUT),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Facebook connection not found.",
    });

    expect(mocks.decryptFacebookToken).not.toHaveBeenCalled();
  });

  /**
   * Tests 8-9:
   * Expired and revoked connections cannot publish.
   */
  it.each(["expired", "revoked"])(
    "rejects a connection with status %s",
    async (status) => {
      mocks.lean.mockResolvedValue(connectionFixture({ status }));

      await expect(
        getFacebookPublishingCredentials(VALID_INPUT),
      ).rejects.toMatchObject({
        statusCode: 409,
        message: "Facebook connection is not active. Reconnect the Page.",
      });

      expect(mocks.decryptFacebookToken).not.toHaveBeenCalled();
    },
  );

  /**
   * Tests 10-11:
   * Reject missing or insufficient Page tasks.
   */
  it.each([
    ["without CREATE_CONTENT", ["MANAGE"]],
    ["with no stored tasks", []],
  ])("rejects publishing permission %s", async (_description, tasks) => {
    mocks.lean.mockResolvedValue(connectionFixture({ tasks }));

    await expect(
      getFacebookPublishingCredentials(VALID_INPUT),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Facebook Page publishing permission is unavailable.",
    });

    expect(mocks.decryptFacebookToken).not.toHaveBeenCalled();
  });

  /**
   * Test 12:
   * Reject missing encrypted credentials.
   */
  it("rejects missing Page access tokens", async () => {
    mocks.lean.mockResolvedValue(
      connectionFixture({
        pageAccessTokenEncrypted: "",
      }),
    );

    await expect(
      getFacebookPublishingCredentials(VALID_INPUT),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Facebook Page credentials are unavailable. Reconnect the Page.",
    });

    expect(mocks.decryptFacebookToken).not.toHaveBeenCalled();
  });

  /**
   * Test 13:
   * Handle token decryption failures safely.
   */
  it("handles decryption failures without exposing secrets", async () => {
    const sensitiveError = `Decryption failed for ${ENCRYPTED_TOKEN}`;

    mocks.decryptFacebookToken.mockImplementation(() => {
      throw new Error(sensitiveError);
    });

    await expect(
      getFacebookPublishingCredentials(VALID_INPUT),
    ).rejects.toMatchObject({
      name: "FacebookPublishingCredentialsError",
      statusCode: 503,
      message:
        "Unable to access Facebook Page credentials. Reconnect the Page or check server configuration.",
    });

    try {
      await getFacebookPublishingCredentials(VALID_INPUT);
    } catch (error) {
      expect(
        JSON.stringify({
          message: error instanceof Error ? error.message : "",
        }),
      ).not.toContain(ENCRYPTED_TOKEN);
    }
  });

  /**
   * Test 14:
   * Reject empty decrypted credentials.
   */
  it("rejects empty decrypted Page access tokens", async () => {
    mocks.decryptFacebookToken.mockReturnValue("   ");

    await expect(
      getFacebookPublishingCredentials(VALID_INPUT),
    ).rejects.toBeInstanceOf(FacebookPublishingCredentialsError);
  });

  /**
   * Test 15:
   * Unexpected database failures propagate.
   *
   * The publishing adapter will handle these
   * without leaking database details.
   */
  it("propagates unexpected database failures", async () => {
    mocks.lean.mockRejectedValue(new Error("MongoDB connection unavailable"));

    await expect(getFacebookPublishingCredentials(VALID_INPUT)).rejects.toThrow(
      "MongoDB connection unavailable",
    );

    expect(mocks.decryptFacebookToken).not.toHaveBeenCalled();
  });
});
