import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  findOneAndUpdateMock,
  findOneAndDeleteMock,
  getWorkspaceMock,
  encryptTokenMock,
} = vi.hoisted(() => ({
  findOneAndUpdateMock: vi.fn(),
  findOneAndDeleteMock: vi.fn(),
  getWorkspaceMock: vi.fn(),
  encryptTokenMock: vi.fn((token: string) => `encrypted:${token}`),
}));

vi.mock("../../models/LinkedInConnection.js", () => ({
  default: {
    findOneAndUpdate: findOneAndUpdateMock,
    findOneAndDelete: findOneAndDeleteMock,
  },
}));

vi.mock("../workspaceService.js", () => ({
  getUserWorkspaceById: getWorkspaceMock,
  isValidWorkspaceId: (id: string) => /^[a-f\d]{24}$/i.test(id),
}));

vi.mock("./linkedinTokenEncryptionService.js", () => ({
  encryptLinkedInToken: encryptTokenMock,
}));

import {
  LinkedInConnectionError,
  disconnectLinkedInConnection,
  saveLinkedInConnection,
} from "./linkedinConnectionService.js";

const workspaceId = "507f1f77bcf86cd799439011";
const authUser = {
  id: "supabase-user-123",
  email: "test@example.com",
};

const profile = {
  memberId: "linkedin-member-123",
  displayName: "Test Member",
  profilePictureUrl: "https://example.com/profile.jpg",
};

const tokens = {
  access_token: "raw-access-token",
  expires_in: 3600,
  refresh_token: "raw-refresh-token",
  refresh_token_expires_in: 86400,
  scope: "openid profile w_member_social",
};

const workspace = {
  _id: {
    toString: () => workspaceId,
  },
};

function makeConnection(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => "connection-id-123" },
    workspaceId: workspace._id,
    linkedinMemberId: profile.memberId,
    displayName: profile.displayName,
    profilePictureUrl: profile.profilePictureUrl,
    tokenExpiresAt: new Date(1_700_003_600_000),
    refreshTokenExpiresAt: new Date(1_700_086_400_000),
    scopes: ["openid", "profile", "w_member_social"],
    status: "connected",
    ...overrides,
  };
}

describe("LinkedIn connection service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getWorkspaceMock.mockResolvedValue(workspace);
    encryptTokenMock.mockImplementation(
      (token: string) => `encrypted:${token}`,
    );
    findOneAndUpdateMock.mockResolvedValue(makeConnection());
    findOneAndDeleteMock.mockResolvedValue(makeConnection());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("saves an encrypted connection and returns safe metadata", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

    const result = await saveLinkedInConnection({
      authUser,
      workspaceId,
      profile,
      tokens,
    });

    expect(getWorkspaceMock).toHaveBeenCalledWith(authUser, workspaceId);

    expect(encryptTokenMock).toHaveBeenCalledWith("raw-access-token");
    expect(encryptTokenMock).toHaveBeenCalledWith("raw-refresh-token");

    const [filter, update, options] = findOneAndUpdateMock.mock.calls[0]!;

    expect(filter).toEqual({
      workspaceId: workspace._id,
      linkedinMemberId: profile.memberId,
    });

    expect(update.$set).toMatchObject({
      connectedByUserId: authUser.id,
      accessTokenEncrypted: "encrypted:raw-access-token",
      refreshTokenEncrypted: "encrypted:raw-refresh-token",
      tokenExpiresAt: new Date(1_700_003_600_000),
      refreshTokenExpiresAt: new Date(1_700_086_400_000),
      scopes: ["openid", "profile", "w_member_social"],
      status: "connected",
      displayName: profile.displayName,
      profilePictureUrl: profile.profilePictureUrl,
    });

    expect(update.$setOnInsert).toEqual({
      workspaceId: workspace._id,
      linkedinMemberId: profile.memberId,
    });

    expect(update.$unset).toBeUndefined();

    expect(options).toMatchObject({
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    });

    expect(result).toMatchObject({
      id: "connection-id-123",
      workspaceId,
      linkedinMemberId: profile.memberId,
      displayName: profile.displayName,
      profilePictureUrl: profile.profilePictureUrl,
      scopes: ["openid", "profile", "w_member_social"],
      status: "connected",
    });

    expect(JSON.stringify(result)).not.toContain("raw-access-token");
    expect(JSON.stringify(result)).not.toContain("raw-refresh-token");
    expect(JSON.stringify(result)).not.toContain("encrypted:");
  });

  it("rejects malformed workspace IDs before querying ownership", async () => {
    await expect(
      saveLinkedInConnection({
        authUser,
        workspaceId: "invalid-id",
        profile,
        tokens,
      }),
    ).rejects.toMatchObject({
      name: "LinkedInConnectionError",
      statusCode: 404,
    });

    expect(getWorkspaceMock).not.toHaveBeenCalled();
    expect(findOneAndUpdateMock).not.toHaveBeenCalled();
  });

  it("rejects a user without an ID", async () => {
    await expect(
      saveLinkedInConnection({
        authUser: { id: " ", email: null },
        workspaceId,
        profile,
        tokens,
      }),
    ).rejects.toMatchObject({
      name: "LinkedInConnectionError",
      statusCode: 401,
    });

    expect(getWorkspaceMock).not.toHaveBeenCalled();
  });

  it("rejects workspaces the user does not own", async () => {
    getWorkspaceMock.mockResolvedValue(null);

    await expect(
      saveLinkedInConnection({
        authUser,
        workspaceId,
        profile,
        tokens,
      }),
    ).rejects.toBeInstanceOf(LinkedInConnectionError);

    expect(findOneAndUpdateMock).not.toHaveBeenCalled();
  });

  it("rejects an empty LinkedIn member ID", async () => {
    await expect(
      saveLinkedInConnection({
        authUser,
        workspaceId,
        profile: { memberId: " " },
        tokens,
      }),
    ).rejects.toMatchObject({
      name: "LinkedInConnectionError",
      statusCode: 502,
    });

    expect(findOneAndUpdateMock).not.toHaveBeenCalled();
  });

  it("unsets old refresh-token fields when no refresh token is issued", async () => {
    const {
      refresh_token: _refreshToken,
      refresh_token_expires_in: _expiry,
      ...tokensWithoutRefresh
    } = tokens;

    findOneAndUpdateMock.mockResolvedValue(
      makeConnection({
        refreshTokenExpiresAt: undefined,
      }),
    );

    await saveLinkedInConnection({
      authUser,
      workspaceId,
      profile,
      tokens: tokensWithoutRefresh,
    });

    const update = findOneAndUpdateMock.mock.calls[0]![1];

    expect(update.$unset).toEqual({
      refreshTokenEncrypted: 1,
      refreshTokenExpiresAt: 1,
    });

    expect(update.$set.refreshTokenEncrypted).toBeUndefined();
    expect(update.$set.refreshTokenExpiresAt).toBeUndefined();
  });

  it("reports an error when MongoDB returns no connection", async () => {
    findOneAndUpdateMock.mockResolvedValue(null);

    await expect(
      saveLinkedInConnection({
        authUser,
        workspaceId,
        profile,
        tokens,
      }),
    ).rejects.toMatchObject({
      name: "LinkedInConnectionError",
      statusCode: 500,
    });
  });

  it("disconnects only the selected connection in the authorized workspace", async () => {
    const result = await disconnectLinkedInConnection({
      authUser,
      workspaceId,
      connectionId: "507f1f77bcf86cd799439012",
    });

    expect(getWorkspaceMock).toHaveBeenCalledWith(authUser, workspaceId);
    expect(findOneAndDeleteMock).toHaveBeenCalledWith({
      _id: "507f1f77bcf86cd799439012",
      workspaceId: workspace._id,
    });
    expect(result).toEqual({ disconnected: true });
    expect(JSON.stringify(result)).not.toContain("token");
  });

  it("rejects a malformed connection ID without deleting anything", async () => {
    await expect(
      disconnectLinkedInConnection({
        authUser,
        workspaceId,
        connectionId: "invalid-id",
      }),
    ).rejects.toMatchObject({
      name: "LinkedInConnectionError",
      statusCode: 404,
    });

    expect(findOneAndDeleteMock).not.toHaveBeenCalled();
  });

  it("rejects a user without an ID", async () => {
    await expect(
      disconnectLinkedInConnection({
        authUser: { id: " ", email: null },
        workspaceId,
        connectionId: "507f1f77bcf86cd799439012",
      }),
    ).rejects.toMatchObject({
      name: "LinkedInConnectionError",
      statusCode: 401,
    });

    expect(findOneAndDeleteMock).not.toHaveBeenCalled();
  });

  it("does not delete a connection from a workspace the user does not own", async () => {
    getWorkspaceMock.mockResolvedValue(null);

    await expect(
      disconnectLinkedInConnection({
        authUser,
        workspaceId,
        connectionId: "507f1f77bcf86cd799439012",
      }),
    ).rejects.toMatchObject({
      name: "LinkedInConnectionError",
      statusCode: 404,
    });

    expect(findOneAndDeleteMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the selected connection does not exist in the workspace", async () => {
    findOneAndDeleteMock.mockResolvedValue(null);

    await expect(
      disconnectLinkedInConnection({
        authUser,
        workspaceId,
        connectionId: "507f1f77bcf86cd799439012",
      }),
    ).rejects.toMatchObject({
      name: "LinkedInConnectionError",
      statusCode: 404,
    });
  });
});
