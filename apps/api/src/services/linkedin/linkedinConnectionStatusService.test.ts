import { beforeEach, describe, expect, it, vi } from "vitest";

const { findOneMock, selectMock, sortMock, leanMock, getWorkspaceMock } =
  vi.hoisted(() => ({
    findOneMock: vi.fn(),
    selectMock: vi.fn(),
    sortMock: vi.fn(),
    leanMock: vi.fn(),
    getWorkspaceMock: vi.fn(),
  }));

vi.mock("../../models/LinkedInConnection.js", () => ({
  default: {
    findOne: findOneMock,
  },
}));

vi.mock("../workspaceService.js", () => ({
  getUserWorkspaceById: getWorkspaceMock,
  isValidWorkspaceId: (id: string) => /^[a-f\d]{24}$/i.test(id),
}));

import { getLinkedInConnectionStatus } from "./linkedinConnectionStatusService.js";

import { LinkedInConnectionError } from "./linkedinConnectionService.js";

const workspaceId = "507f1f77bcf86cd799439011";

const authUser = {
  id: "supabase-user-123",
  email: "test@example.com",
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
    linkedinMemberId: "linkedin-member-123",
    displayName: "Test Member",
    profilePictureUrl: "https://example.com/profile.jpg",
    tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    status: "connected",
    ...overrides,
  };
}

describe("LinkedIn connection status service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getWorkspaceMock.mockResolvedValue(workspace);

    findOneMock.mockReturnValue({
      select: selectMock,
    });

    selectMock.mockReturnValue({
      sort: sortMock,
    });

    sortMock.mockReturnValue({
      lean: leanMock,
    });

    leanMock.mockResolvedValue(null);
  });

  it("returns disconnected when the workspace has no LinkedIn connection", async () => {
    const result = await getLinkedInConnectionStatus(authUser, workspaceId);

    expect(result).toEqual({
      connected: false,
      connection: null,
    });

    expect(getWorkspaceMock).toHaveBeenCalledWith(authUser, workspaceId);

    expect(findOneMock).toHaveBeenCalledWith({
      workspaceId: workspace._id,
    });

    expect(selectMock).toHaveBeenCalledWith(
      "_id workspaceId linkedinMemberId displayName profilePictureUrl tokenExpiresAt status",
    );

    expect(sortMock).toHaveBeenCalledWith({ updatedAt: -1 });
  });

  it("returns safe metadata for a connected workspace", async () => {
    leanMock.mockResolvedValue(makeConnection());

    const result = await getLinkedInConnectionStatus(authUser, workspaceId);

    expect(result.connected).toBe(true);
    expect(result.connection).toMatchObject({
      id: "connection-id-123",
      workspaceId,
      linkedinMemberId: "linkedin-member-123",
      displayName: "Test Member",
      status: "connected",
    });

    expect(JSON.stringify(result)).not.toContain("accessTokenEncrypted");
    expect(JSON.stringify(result)).not.toContain("refreshTokenEncrypted");
    expect(JSON.stringify(result)).not.toContain("access_token");
  });

  it("reports an expired access token as expired", async () => {
    leanMock.mockResolvedValue(
      makeConnection({
        tokenExpiresAt: new Date(Date.now() - 60 * 1000),
      }),
    );

    const result = await getLinkedInConnectionStatus(authUser, workspaceId);

    expect(result.connected).toBe(false);
    expect(result.connection?.status).toBe("expired");
  });

  it("preserves a revoked connection status", async () => {
    leanMock.mockResolvedValue(makeConnection({ status: "revoked" }));

    const result = await getLinkedInConnectionStatus(authUser, workspaceId);

    expect(result.connected).toBe(false);
    expect(result.connection?.status).toBe("revoked");
  });

  it("rejects a malformed workspace ID before querying", async () => {
    await expect(
      getLinkedInConnectionStatus(authUser, "invalid-id"),
    ).rejects.toBeInstanceOf(LinkedInConnectionError);

    expect(getWorkspaceMock).not.toHaveBeenCalled();
    expect(findOneMock).not.toHaveBeenCalled();
  });

  it("rejects a user without an ID", async () => {
    await expect(
      getLinkedInConnectionStatus({ id: " ", email: null }, workspaceId),
    ).rejects.toMatchObject({
      statusCode: 401,
    });

    expect(getWorkspaceMock).not.toHaveBeenCalled();
    expect(findOneMock).not.toHaveBeenCalled();
  });

  it("rejects a workspace the user does not own", async () => {
    getWorkspaceMock.mockResolvedValueOnce(null);

    await expect(
      getLinkedInConnectionStatus(authUser, workspaceId),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(findOneMock).not.toHaveBeenCalled();
  });
});
