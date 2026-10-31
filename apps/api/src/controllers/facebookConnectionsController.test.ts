import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Request, Response } from "express";

import { getFacebookConnectionsController } from "./facebookController.js";

import {
  listFacebookConnections,
  FacebookConnectionQueryError,
} from "../services/facebook/facebookConnectionQueryService.js";

/**
 * Mock the connection query service.
 *
 * These tests do not connect to MongoDB
 * or retrieve actual Facebook access tokens.
 */
vi.mock("../services/facebook/facebookConnectionQueryService.js", () => {
  class FacebookConnectionQueryError extends Error {
    constructor(
      message: string,
      public readonly statusCode: number,
    ) {
      super(message);
      this.name = "FacebookConnectionQueryError";
    }
  }

  return {
    listFacebookConnections: vi.fn(),
    FacebookConnectionQueryError,
  };
});

const WORKSPACE_ID = "507f1f77bcf86cd799439011";

const AUTH_USER = {
  id: "test-supabase-user",
};

/**
 * Create minimal Express request and response
 * objects for controller testing.
 */
function createHttpContext({
  workspaceId = WORKSPACE_ID,
  authenticated = true,
}: {
  workspaceId?: string | null;
  authenticated?: boolean;
} = {}) {
  const req = {
    query: workspaceId === null ? {} : { workspaceId },
  } as unknown as Request;

  const res = {
    locals: authenticated ? { authUser: AUTH_USER } : {},

    status: vi.fn().mockReturnThis(),

    json: vi.fn().mockReturnThis(),
  } as unknown as Response;

  return { req, res };
}

describe("getFacebookConnectionsController", () => {
  beforeEach(() => {
    vi.mocked(listFacebookConnections).mockReset();
  });

  it("rejects unauthenticated requests", async () => {
    const { req, res } = createHttpContext({
      authenticated: false,
    });

    await getFacebookConnectionsController(req, res);

    expect(res.status).toHaveBeenCalledWith(401);

    expect(res.json).toHaveBeenCalledWith({
      message: "Authentication is required.",
    });

    expect(listFacebookConnections).not.toHaveBeenCalled();
  });

  it("rejects requests without a workspace ID", async () => {
    const { req, res } = createHttpContext({
      workspaceId: null,
    });

    await getFacebookConnectionsController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);

    expect(res.json).toHaveBeenCalledWith({
      message: "A valid workspace is required.",
    });

    expect(listFacebookConnections).not.toHaveBeenCalled();
  });

  it("rejects invalid workspace IDs", async () => {
    const { req, res } = createHttpContext({
      workspaceId: "invalid-workspace",
    });

    await getFacebookConnectionsController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);

    expect(listFacebookConnections).not.toHaveBeenCalled();
  });

  it("rejects access to an inaccessible workspace", async () => {
    vi.mocked(listFacebookConnections).mockRejectedValue(
      new FacebookConnectionQueryError("Workspace not found.", 404),
    );

    const { req, res } = createHttpContext();

    await getFacebookConnectionsController(req, res);

    expect(listFacebookConnections).toHaveBeenCalledWith(
      AUTH_USER,
      WORKSPACE_ID,
    );

    expect(res.status).toHaveBeenCalledWith(404);

    expect(res.json).toHaveBeenCalledWith({
      message: "Workspace not found.",
    });
  });

  it("returns connected Facebook Pages", async () => {
    const connections = [
      {
        id: "507f1f77bcf86cd799439013",
        facebookPageId: "123456789",
        pageName: "Storm Business",
        status: "connected" as const,
        canPublish: true,
      },
      {
        id: "507f1f77bcf86cd799439014",
        facebookPageId: "987654321",
        pageName: "Storm Community",
        status: "expired" as const,
        canPublish: false,
      },
    ];

    vi.mocked(listFacebookConnections).mockResolvedValue(connections);

    const { req, res } = createHttpContext();

    await getFacebookConnectionsController(req, res);

    expect(listFacebookConnections).toHaveBeenCalledWith(
      AUTH_USER,
      WORKSPACE_ID,
    );

    expect(res.status).toHaveBeenCalledWith(200);

    expect(res.json).toHaveBeenCalledWith({
      connections,
    });
  });

  it("returns an empty array when no Pages are connected", async () => {
    vi.mocked(listFacebookConnections).mockResolvedValue([]);

    const { req, res } = createHttpContext();

    await getFacebookConnectionsController(req, res);

    expect(res.status).toHaveBeenCalledWith(200);

    expect(res.json).toHaveBeenCalledWith({
      connections: [],
    });
  });

  it("handles known service validation errors", async () => {
    vi.mocked(listFacebookConnections).mockRejectedValue(
      new FacebookConnectionQueryError("A valid workspace is required.", 400),
    );

    const { req, res } = createHttpContext();

    await getFacebookConnectionsController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);

    expect(res.json).toHaveBeenCalledWith({
      message: "A valid workspace is required.",
    });
  });

  it("does not expose unexpected server errors", async () => {
    vi.mocked(listFacebookConnections).mockRejectedValue(
      new Error("Sensitive internal database error"),
    );

    const { req, res } = createHttpContext();

    await getFacebookConnectionsController(req, res);

    expect(res.status).toHaveBeenCalledWith(500);

    expect(res.json).toHaveBeenCalledWith({
      message: "Unable to retrieve Facebook connections.",
    });

    expect(JSON.stringify(vi.mocked(res.json).mock.calls)).not.toContain(
      "Sensitive internal database error",
    );
  });
});
