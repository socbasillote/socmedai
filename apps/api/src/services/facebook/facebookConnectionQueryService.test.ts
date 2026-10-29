import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "../userProfileService.js";

import {
  listFacebookConnections,
  FacebookConnectionQueryError,
} from "./facebookConnectionQueryService.js";

/**
 * Shared mocks for workspace authorization
 * and the Mongoose query chain.
 */
const mocks = vi.hoisted(() => ({
  isValidWorkspaceId: vi.fn(),
  getUserWorkspaceById: vi.fn(),

  find: vi.fn(),
  select: vi.fn(),
  sort: vi.fn(),
  lean: vi.fn(),
}));

/**
 * Mock workspace validation and authorization.
 */
vi.mock("../workspaceService.js", () => ({
  isValidWorkspaceId: mocks.isValidWorkspaceId,
  getUserWorkspaceById: mocks.getUserWorkspaceById,
}));

/**
 * Mock the FacebookConnection model.
 *
 * No real MongoDB connection is required.
 */
vi.mock("../../models/FacebookConnection.js", () => ({
  default: {
    find: mocks.find,
  },
}));

const WORKSPACE_ID = "507f1f77bcf86cd799439011";

const AUTH_USER = {
  id: "test-supabase-user",
} as AuthenticatedUser;

describe("listFacebookConnections", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Default: workspace is valid and accessible.
    mocks.isValidWorkspaceId.mockReturnValue(true);

    mocks.getUserWorkspaceById.mockResolvedValue({
      _id: WORKSPACE_ID,
      name: "Storm Marketing",
    });

    // Simulate:
    // FacebookConnection.find()
    //   .select()
    //   .sort()
    //   .lean()
    mocks.find.mockReturnValue({
      select: mocks.select,
    });

    mocks.select.mockReturnValue({
      sort: mocks.sort,
    });

    mocks.sort.mockReturnValue({
      lean: mocks.lean,
    });

    mocks.lean.mockResolvedValue([]);
  });

  /**
   * Test 1: Reject invalid workspace IDs.
   */
  it("rejects invalid workspace IDs", async () => {
    mocks.isValidWorkspaceId.mockReturnValue(false);

    await expect(
      listFacebookConnections(AUTH_USER, "invalid-workspace"),
    ).rejects.toMatchObject({
      message: "A valid workspace is required.",
      statusCode: 400,
    });

    expect(mocks.getUserWorkspaceById).not.toHaveBeenCalled();

    expect(mocks.find).not.toHaveBeenCalled();
  });

  /**
   * Test 2: Reject inaccessible workspaces.
   */
  it("rejects inaccessible workspaces", async () => {
    mocks.getUserWorkspaceById.mockResolvedValue(null);

    await expect(
      listFacebookConnections(AUTH_USER, WORKSPACE_ID),
    ).rejects.toMatchObject({
      message: "Workspace not found.",
      statusCode: 404,
    });

    expect(mocks.getUserWorkspaceById).toHaveBeenCalledWith(
      AUTH_USER,
      WORKSPACE_ID,
    );

    // No Facebook connection query should occur
    // when workspace access is denied.
    expect(mocks.find).not.toHaveBeenCalled();
  });

  /**
   * Test 3: Query only the requested workspace.
   */
  it("queries Facebook connections for the selected workspace", async () => {
    await listFacebookConnections(AUTH_USER, WORKSPACE_ID);

    expect(mocks.getUserWorkspaceById).toHaveBeenCalledWith(
      AUTH_USER,
      WORKSPACE_ID,
    );

    expect(mocks.find).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
    });

    expect(mocks.find).toHaveBeenCalledTimes(1);
  });

  /**
   * Test 4: Select only non-sensitive fields.
   */
  it("selects only safe Facebook connection fields", async () => {
    await listFacebookConnections(AUTH_USER, WORKSPACE_ID);

    expect(mocks.select).toHaveBeenCalledWith(
      "_id facebookPageId pageName status",
    );

    expect(mocks.sort).toHaveBeenCalledWith({
      pageName: 1,
    });

    expect(mocks.lean).toHaveBeenCalledTimes(1);
  });

  /**
   * Test 5: Map database documents into
   * safe public connection summaries.
   */
  it("returns safe Facebook connection summaries", async () => {
    mocks.lean.mockResolvedValue([
      {
        _id: "507f1f77bcf86cd799439013",
        workspaceId: WORKSPACE_ID,
        facebookPageId: "123456789",
        pageName: "Storm Business",
        status: "connected",

        // Simulated sensitive fields.
        // These must never appear in the response.
        encryptedPageAccessToken: "private-value",
        facebookUserId: "private-user-id",
      },
      {
        _id: "507f1f77bcf86cd799439014",
        workspaceId: WORKSPACE_ID,
        facebookPageId: "987654321",
        pageName: "Storm Community",
        status: "expired",
      },
    ]);

    const connections = await listFacebookConnections(AUTH_USER, WORKSPACE_ID);

    expect(connections).toEqual([
      {
        id: "507f1f77bcf86cd799439013",
        facebookPageId: "123456789",
        pageName: "Storm Business",
        status: "connected",
      },
      {
        id: "507f1f77bcf86cd799439014",
        facebookPageId: "987654321",
        pageName: "Storm Community",
        status: "expired",
      },
    ]);

    const serialized = JSON.stringify(connections);

    expect(serialized).not.toContain("encryptedPageAccessToken");

    expect(serialized).not.toContain("private-value");

    expect(serialized).not.toContain("facebookUserId");

    expect(serialized).not.toContain("private-user-id");
  });

  /**
   * Test 6: Return empty results correctly.
   */
  it("returns an empty array when no Pages are connected", async () => {
    mocks.lean.mockResolvedValue([]);

    const connections = await listFacebookConnections(AUTH_USER, WORKSPACE_ID);

    expect(connections).toEqual([]);

    expect(mocks.find).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
    });
  });

  /**
   * Test 7: Propagate unexpected database errors.
   *
   * The controller is responsible for converting
   * these errors into safe HTTP 500 responses.
   */
  it("propagates unexpected database errors", async () => {
    mocks.lean.mockRejectedValue(new Error("MongoDB query failed."));

    await expect(
      listFacebookConnections(AUTH_USER, WORKSPACE_ID),
    ).rejects.toThrow("MongoDB query failed.");
  });
});
