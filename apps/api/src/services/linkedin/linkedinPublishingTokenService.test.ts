import { beforeEach, describe, expect, it, vi } from "vitest";
const connectionId = "507f1f77bcf86cd799439011";

const mocks = vi.hoisted(() => ({
  getUserWorkspaceById: vi.fn(),
  isValidWorkspaceId: vi.fn(),
  findOne: vi.fn(),
  decryptLinkedInToken: vi.fn(),
}));

vi.mock("../../models/LinkedInConnection.js", () => ({
  default: {
    findOne: mocks.findOne,
  },
}));

vi.mock("../workspaceService.js", () => ({
  getUserWorkspaceById: mocks.getUserWorkspaceById,
  isValidWorkspaceId: mocks.isValidWorkspaceId,
}));

vi.mock("./linkedinTokenEncryptionService.js", () => ({
  decryptLinkedInToken: mocks.decryptLinkedInToken,
}));

import { getLinkedInPublishingCredentials } from "./linkedinPublishingTokenService.js";

describe("getLinkedInPublishingCredentials", () => {
  const authUser = { id: "user-123" } as Parameters<
    typeof getLinkedInPublishingCredentials
  >[0]["authUser"];

  const workspaceId = "507f1f77bcf86cd799439011";

  const connection = {
    _id: { toString: () => "connection-123" },
    linkedinMemberId: "member-123",
    status: "connected",
    tokenExpiresAt: new Date(Date.now() + 60_000),
    scopes: ["openid", "profile", "w_member_social"],
    accessTokenEncrypted: "encrypted-token",
  };

  function mockConnection(value: typeof connection | null) {
    const lean = vi.fn().mockResolvedValue(value);
    const sort = vi.fn().mockReturnValue({ lean });
    const select = vi.fn().mockReturnValue({ sort });

    mocks.findOne.mockReturnValue({ select });

    return { select, sort, lean };
  }

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.isValidWorkspaceId.mockReturnValue(true);

    mocks.getUserWorkspaceById.mockResolvedValue({
      _id: workspaceId,
    });

    mocks.decryptLinkedInToken.mockReturnValue("decrypted-token");

    mockConnection({
      ...connection,
      tokenExpiresAt: new Date(Date.now() + 60_000),
    });
  });

  it("returns credentials for a valid connection", async () => {
    const result = await getLinkedInPublishingCredentials({
      authUser,
      workspaceId,
      connectionId,
    });

    expect(result).toEqual({
      accessToken: "decrypted-token",
      linkedinMemberId: "member-123",
      connectionId: "connection-123",
    });

    expect(mocks.findOne).toHaveBeenCalledWith({
      _id: connectionId,
      workspaceId,
    });

    expect(mocks.decryptLinkedInToken).toHaveBeenCalledWith("encrypted-token");
  });

  it("rejects access to an unauthorized workspace", async () => {
    mocks.getUserWorkspaceById.mockResolvedValue(null);

    await expect(
      getLinkedInPublishingCredentials({ authUser, workspaceId, connectionId }),
    ).rejects.toThrow("Workspace not found.");

    expect(mocks.findOne).not.toHaveBeenCalled();
  });

  it("rejects a missing LinkedIn connection", async () => {
    mockConnection(null);

    await expect(
      getLinkedInPublishingCredentials({ authUser, workspaceId, connectionId }),
    ).rejects.toThrow("Connect a LinkedIn account");
  });

  it("rejects an expired token", async () => {
    mockConnection({
      ...connection,
      tokenExpiresAt: new Date(Date.now() - 60_000),
    });

    await expect(
      getLinkedInPublishingCredentials({ authUser, workspaceId, connectionId }),
    ).rejects.toThrow("expired");
  });

  it("rejects a revoked connection", async () => {
    mockConnection({
      ...connection,
      status: "revoked",
    });

    await expect(
      getLinkedInPublishingCredentials({ authUser, workspaceId, connectionId }),
    ).rejects.toThrow("not active");
  });

  it("rejects a connection without publishing permission", async () => {
    mockConnection({
      ...connection,
      scopes: ["openid", "profile"],
    });

    await expect(
      getLinkedInPublishingCredentials({ authUser, workspaceId, connectionId }),
    ).rejects.toThrow("lacks permission");
  });

  it("rejects an unavailable encrypted token", async () => {
    mockConnection({
      ...connection,
      accessTokenEncrypted: "",
    });

    await expect(
      getLinkedInPublishingCredentials({ authUser, workspaceId, connectionId }),
    ).rejects.toThrow("unavailable");
  });

  it("handles token decryption failures safely", async () => {
    mocks.decryptLinkedInToken.mockImplementation(() => {
      throw new Error("Sensitive internal encryption details");
    });

    await expect(
      getLinkedInPublishingCredentials({ authUser, workspaceId, connectionId }),
    ).rejects.toThrow("Unable to decrypt");

    expect(mocks.decryptLinkedInToken).toHaveBeenCalledOnce();
  });
});
