import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "../userProfileService.js";

import {
  authorizeFacebookPublishTarget,
  FacebookPublishAuthorizationError,
} from "./facebookPublishAuthorizationService.js";

import type { FacebookPublishInput } from "./facebookPublishInput.js";

const mocks = vi.hoisted(() => ({
  isValidWorkspaceId: vi.fn(),
  getUserWorkspaceById: vi.fn(),
  findOne: vi.fn(),
  select: vi.fn(),
  lean: vi.fn(),
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

const WORKSPACE_ID = "507f1f77bcf86cd799439011";
const CONNECTION_ID = "507f1f77bcf86cd799439013";
const PAGE_ID = "123456789";

const AUTH_USER = {
  id: "test-supabase-user",
} as AuthenticatedUser;

const VALID_INPUT: FacebookPublishInput = {
  workspaceId: WORKSPACE_ID,
  facebookConnectionId: CONNECTION_ID,
  message: "Hello from Storm!",
};

function connectionFixture(overrides: Record<string, unknown> = {}) {
  return {
    _id: CONNECTION_ID,
    facebookPageId: PAGE_ID,
    status: "connected",
    tasks: ["CREATE_CONTENT"],
    ...overrides,
  };
}

describe("authorizeFacebookPublishTarget", () => {
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
  });

  it("rejects an invalid workspace", async () => {
    mocks.isValidWorkspaceId.mockReturnValue(false);

    await expect(
      authorizeFacebookPublishTarget(AUTH_USER, {
        ...VALID_INPUT,
        workspaceId: "invalid",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "A valid workspace is required.",
    });

    expect(mocks.findOne).not.toHaveBeenCalled();
  });

  it("rejects an invalid Facebook connection ID", async () => {
    await expect(
      authorizeFacebookPublishTarget(AUTH_USER, {
        ...VALID_INPUT,
        facebookConnectionId: "invalid",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "A valid Facebook connection is required.",
    });

    expect(mocks.findOne).not.toHaveBeenCalled();
  });

  it("rejects inaccessible workspaces", async () => {
    mocks.getUserWorkspaceById.mockResolvedValue(null);

    await expect(
      authorizeFacebookPublishTarget(AUTH_USER, VALID_INPUT),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Workspace not found.",
    });

    expect(mocks.findOne).not.toHaveBeenCalled();
  });

  it("queries the connection within the authorized workspace", async () => {
    await authorizeFacebookPublishTarget(AUTH_USER, VALID_INPUT);

    expect(mocks.getUserWorkspaceById).toHaveBeenCalledWith(
      AUTH_USER,
      WORKSPACE_ID,
    );

    expect(mocks.findOne).toHaveBeenCalledWith({
      _id: CONNECTION_ID,
      workspaceId: WORKSPACE_ID,
    });

    expect(mocks.select).toHaveBeenCalledWith(
      "_id facebookPageId status tasks",
    );
  });

  it("rejects a missing or cross-workspace connection", async () => {
    mocks.lean.mockResolvedValue(null);

    await expect(
      authorizeFacebookPublishTarget(AUTH_USER, VALID_INPUT),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Facebook connection not found.",
    });
  });

  it.each(["expired", "revoked"])(
    "rejects a connection with status %s",
    async (status) => {
      mocks.lean.mockResolvedValue(connectionFixture({ status }));

      await expect(
        authorizeFacebookPublishTarget(AUTH_USER, VALID_INPUT),
      ).rejects.toMatchObject({
        statusCode: 409,
        message: "Facebook connection is not active. Reconnect the Page.",
      });
    },
  );

  it("rejects connections without publishing permission", async () => {
    mocks.lean.mockResolvedValue(
      connectionFixture({
        tasks: ["MANAGE"],
      }),
    );

    await expect(
      authorizeFacebookPublishTarget(AUTH_USER, VALID_INPUT),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Facebook Page publishing permission is unavailable.",
    });
  });

  it("rejects connections with missing task metadata", async () => {
    mocks.lean.mockResolvedValue(
      connectionFixture({
        tasks: undefined,
      }),
    );

    await expect(
      authorizeFacebookPublishTarget(AUTH_USER, VALID_INPUT),
    ).rejects.toBeInstanceOf(FacebookPublishAuthorizationError);
  });

  it("returns safe authorized Page metadata", async () => {
    mocks.lean.mockResolvedValue(
      connectionFixture({
        encryptedPageAccessToken: "sensitive-encrypted-token",
      }),
    );

    const result = await authorizeFacebookPublishTarget(AUTH_USER, VALID_INPUT);

    expect(result).toEqual({
      workspaceId: WORKSPACE_ID,
      connectionId: CONNECTION_ID,
      facebookPageId: PAGE_ID,
    });

    expect(JSON.stringify(result)).not.toContain("sensitive-encrypted-token");

    expect(result).not.toHaveProperty("tasks");
    expect(result).not.toHaveProperty("encryptedPageAccessToken");
  });

  it("propagates unexpected database failures", async () => {
    mocks.lean.mockRejectedValue(new Error("Database unavailable"));

    await expect(
      authorizeFacebookPublishTarget(AUTH_USER, VALID_INPUT),
    ).rejects.toThrow("Database unavailable");
  });
});
