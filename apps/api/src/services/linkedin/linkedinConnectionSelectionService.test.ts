import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectionFindOne: vi.fn(),
}));

vi.mock("../../models/LinkedInConnection.js", () => ({
  default: {
    findOne: mocks.connectionFindOne,
  },
}));

import { validateLinkedInConnectionSelection } from "./linkedinConnectionSelectionService.js";

const workspaceId = "507f1f77bcf86cd799439011";
const connectionId = "507f1f77bcf86cd799439012";

function mockConnection(connection: Record<string, unknown> | null) {
  const lean = vi.fn().mockResolvedValue(connection);
  const select = vi.fn().mockReturnValue({ lean });

  mocks.connectionFindOne.mockReturnValue({ select });

  return { select, lean };
}

describe("validateLinkedInConnectionSelection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("accepts a connected account with publishing permission", async () => {
    const query = mockConnection({
      _id: connectionId,
      status: "connected",
      scopes: ["openid", "profile", "w_member_social"],
    });

    const result = await validateLinkedInConnectionSelection({
      workspaceId,
      connectionId,
    });

    expect(result).toBe(connectionId);

    expect(mocks.connectionFindOne).toHaveBeenCalledWith({
      _id: connectionId,
      workspaceId,
    });

    expect(query.select).toHaveBeenCalledWith("_id status scopes");
  });

  it("rejects a connection belonging to another workspace", async () => {
    mockConnection(null);

    await expect(
      validateLinkedInConnectionSelection({
        workspaceId,
        connectionId,
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(mocks.connectionFindOne).toHaveBeenCalledWith({
      _id: connectionId,
      workspaceId,
    });
  });

  it("rejects a revoked connection", async () => {
    mockConnection({
      _id: connectionId,
      status: "revoked",
      scopes: ["w_member_social"],
    });

    await expect(
      validateLinkedInConnectionSelection({
        workspaceId,
        connectionId,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("rejects an expired connection status", async () => {
    mockConnection({
      _id: connectionId,
      status: "expired",
      scopes: ["w_member_social"],
    });

    await expect(
      validateLinkedInConnectionSelection({
        workspaceId,
        connectionId,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("rejects a connection without publishing permission", async () => {
    mockConnection({
      _id: connectionId,
      status: "connected",
      scopes: ["openid", "profile"],
    });

    await expect(
      validateLinkedInConnectionSelection({
        workspaceId,
        connectionId,
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("rejects malformed connection IDs without querying MongoDB", async () => {
    await expect(
      validateLinkedInConnectionSelection({
        workspaceId,
        connectionId: "invalid-id",
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(mocks.connectionFindOne).not.toHaveBeenCalled();
  });

  it("rejects malformed workspace IDs without querying MongoDB", async () => {
    await expect(
      validateLinkedInConnectionSelection({
        workspaceId: "invalid-workspace",
        connectionId,
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(mocks.connectionFindOne).not.toHaveBeenCalled();
  });
});
