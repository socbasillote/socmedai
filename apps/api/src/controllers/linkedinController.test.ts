import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const {
  createAuthorizationUrlMock,
  consumeStateMock,
  completeCallbackMock,
  getConnectionStatusMock,
  disconnectConnectionMock,
} = vi.hoisted(() => ({
  createAuthorizationUrlMock: vi.fn(),
  consumeStateMock: vi.fn(),
  completeCallbackMock: vi.fn(),
  getConnectionStatusMock: vi.fn(),
  disconnectConnectionMock: vi.fn(),
}));

vi.mock("../services/linkedin/linkedinAuthorizationService.js", () => ({
  createLinkedInAuthorizationUrl: createAuthorizationUrlMock,
  LinkedInAuthorizationError: class LinkedInAuthorizationError extends Error {
    constructor(
      message: string,
      public readonly statusCode: number,
    ) {
      super(message);
      this.name = "LinkedInAuthorizationError";
    }
  },
}));

vi.mock("../services/linkedin/linkedinConnectionService.js", () => ({
  disconnectLinkedInConnection: disconnectConnectionMock,
  LinkedInConnectionError: class LinkedInConnectionError extends Error {
    constructor(
      message: string,
      public readonly statusCode: number,
    ) {
      super(message);
      this.name = "LinkedInConnectionError";
    }
  },
}));

vi.mock("../services/linkedin/linkedinOAuthStateService.js", () => ({
  consumeLinkedInOAuthState: consumeStateMock,
}));

vi.mock("../services/linkedin/linkedinCallbackService.js", () => ({
  completeLinkedInOAuthCallback: completeCallbackMock,
}));

vi.mock("../services/linkedin/linkedinConnectionStatusService.js", () => ({
  getLinkedInConnectionStatus: getConnectionStatusMock,
}));

vi.mock("../config/env.js", () => ({
  env: { WEB_ORIGIN: "http://localhost:5173" },
}));

import {
  getLinkedInStatus,
  linkedInOAuthCallback,
  startLinkedInConnect,
  disconnectLinkedIn,
} from "./linkedinController.js";

function createTestApp() {
  const app = express();

  app.use(express.json());

  // Simulate an authenticated user for controller unit tests.
  app.use((req, res, next) => {
    res.locals.authUser = {
      id: "supabase-user-123",
      email: "test@example.com",
    };
    next();
  });

  app.post("/connect", startLinkedInConnect);
  app.get("/status", getLinkedInStatus);
  app.get("/callback", linkedInOAuthCallback);
  app.delete("/connections/:connectionId", disconnectLinkedIn);

  return app;
}

describe("LinkedIn controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createAuthorizationUrlMock.mockResolvedValue(
      "https://www.linkedin.com/oauth/v2/authorization?state=test-state",
    );

    consumeStateMock.mockResolvedValue({
      supabaseUserId: "supabase-user-123",
      workspaceId: "507f1f77bcf86cd799439011",
    });

    completeCallbackMock.mockResolvedValue(undefined);
    disconnectConnectionMock.mockResolvedValue({ disconnected: true });
  });

  it("returns an authorization URL for a valid connect request", async () => {
    const response = await request(createTestApp())
      .post("/connect")
      .send({ workspaceId: "507f1f77bcf86cd799439011" });

    expect(response.status).toBe(200);
    expect(response.body.authorizationUrl).toContain(
      "https://www.linkedin.com/oauth/v2/authorization",
    );

    expect(createAuthorizationUrlMock).toHaveBeenCalledWith(
      { id: "supabase-user-123", email: "test@example.com" },
      "507f1f77bcf86cd799439011",
    );
  });

  it("rejects a connect request without a workspace ID", async () => {
    const response = await request(createTestApp()).post("/connect").send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("A valid workspaceId is required.");
    expect(createAuthorizationUrlMock).not.toHaveBeenCalled();
  });

  it("completes a successful callback and redirects to the frontend", async () => {
    const response = await request(createTestApp())
      .get("/callback")
      .query({ code: "authorization-code", state: "valid-state" });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      "http://localhost:5173/?linkedin=connected",
    );

    expect(completeCallbackMock).toHaveBeenCalledWith({
      code: "authorization-code",
      state: "valid-state",
    });
  });

  it("handles a user-denied authorization without exposing provider details", async () => {
    const response = await request(createTestApp()).get("/callback").query({
      error: "access_denied",
      error_description: "Sensitive provider details",
      state: "valid-state",
    });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      "http://localhost:5173/?linkedin=error&reason=denied",
    );
    expect(response.headers.location).not.toContain("Sensitive");
    expect(consumeStateMock).toHaveBeenCalledWith({ state: "valid-state" });
    expect(completeCallbackMock).not.toHaveBeenCalled();
  });

  it("redirects safely when the callback is missing required parameters", async () => {
    const response = await request(createTestApp()).get("/callback");

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      "http://localhost:5173/?linkedin=error&reason=failed",
    );
    expect(completeCallbackMock).not.toHaveBeenCalled();
  });

  it("does not expose internal errors when callback processing fails", async () => {
    completeCallbackMock.mockRejectedValue(
      new Error("Internal database credentials"),
    );

    const response = await request(createTestApp())
      .get("/callback")
      .query({ code: "authorization-code", state: "valid-state" });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      "http://localhost:5173/?linkedin=error&reason=failed",
    );
    expect(response.headers.location).not.toContain("credentials");
  });

  it("returns 404 when the workspace is inaccessible", async () => {
    createAuthorizationUrlMock.mockRejectedValue(
      new Error("Workspace not found."),
    );

    // Use the same error class that the controller imports.
    const { LinkedInAuthorizationError } =
      await import("../services/linkedin/linkedinAuthorizationService.js");

    createAuthorizationUrlMock.mockRejectedValue(
      new LinkedInAuthorizationError("Workspace not found.", 404),
    );

    const response = await request(createTestApp())
      .post("/connect")
      .send({ workspaceId: "507f1f77bcf86cd799439011" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Workspace not found." });
  });

  it("returns 503 when LinkedIn OAuth is not configured", async () => {
    const { LinkedInAuthorizationError } =
      await import("../services/linkedin/linkedinAuthorizationService.js");

    createAuthorizationUrlMock.mockRejectedValue(
      new LinkedInAuthorizationError(
        "LinkedIn OAuth is not configured on the server.",
        503,
      ),
    );

    const response = await request(createTestApp())
      .post("/connect")
      .send({ workspaceId: "507f1f77bcf86cd799439011" });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: "LinkedIn OAuth is not configured on the server.",
    });
  });

  it("returns disconnected status for a workspace without a connection", async () => {
    getConnectionStatusMock.mockResolvedValue({
      connected: false,
      connection: null,
    });

    const response = await request(createTestApp())
      .get("/status")
      .query({ workspaceId: "507f1f77bcf86cd799439011" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      connected: false,
      connection: null,
    });

    expect(getConnectionStatusMock).toHaveBeenCalledWith(
      { id: "supabase-user-123", email: "test@example.com" },
      "507f1f77bcf86cd799439011",
    );
  });

  it("returns safe connection metadata without exposing tokens", async () => {
    getConnectionStatusMock.mockResolvedValue({
      connected: true,
      connection: {
        id: "connection-123",
        workspaceId: "507f1f77bcf86cd799439011",
        linkedinMemberId: "member-123",
        displayName: "Test Member",
        tokenExpiresAt: "2026-10-22T00:00:00.000Z",
        status: "connected",
      },
    });

    const response = await request(createTestApp())
      .get("/status")
      .query({ workspaceId: "507f1f77bcf86cd799439011" });

    expect(response.status).toBe(200);
    expect(response.body.connected).toBe(true);
    expect(response.body.connection.displayName).toBe("Test Member");
    expect(response.body).not.toHaveProperty("accessToken");
    expect(response.body.connection).not.toHaveProperty("accessToken");
    expect(response.body.connection).not.toHaveProperty("accessTokenEncrypted");
    expect(response.body.connection).not.toHaveProperty(
      "refreshTokenEncrypted",
    );
  });

  it("returns the service error status for an inaccessible workspace", async () => {
    const { LinkedInConnectionError } =
      await import("../services/linkedin/linkedinConnectionService.js");

    getConnectionStatusMock.mockRejectedValue(
      new LinkedInConnectionError("Workspace not found.", 404),
    );

    const response = await request(createTestApp())
      .get("/status")
      .query({ workspaceId: "507f1f77bcf86cd799439011" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Workspace not found." });
  });

  it("disconnects the selected LinkedIn connection", async () => {
    const response = await request(createTestApp())
      .delete("/connections/507f1f77bcf86cd799439012")
      .query({ workspaceId: "507f1f77bcf86cd799439011" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ disconnected: true });

    expect(disconnectConnectionMock).toHaveBeenCalledWith({
      authUser: {
        id: "supabase-user-123",
        email: "test@example.com",
      },
      workspaceId: "507f1f77bcf86cd799439011",
      connectionId: "507f1f77bcf86cd799439012",
    });

    expect(JSON.stringify(response.body)).not.toContain("token");
  });

  it("returns the service error status for a failed disconnect", async () => {
    const { LinkedInConnectionError } =
      await import("../services/linkedin/linkedinConnectionService.js");

    disconnectConnectionMock.mockRejectedValue(
      new LinkedInConnectionError("LinkedIn connection not found.", 404),
    );

    const response = await request(createTestApp())
      .delete("/connections/507f1f77bcf86cd799439012")
      .query({ workspaceId: "507f1f77bcf86cd799439011" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: "LinkedIn connection not found.",
    });
  });

  it("does not expose internal errors when disconnecting fails unexpectedly", async () => {
    disconnectConnectionMock.mockRejectedValue(
      new Error("Sensitive database details"),
    );

    const response = await request(createTestApp())
      .delete("/connections/507f1f77bcf86cd799439012")
      .query({ workspaceId: "507f1f77bcf86cd799439011" });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: "Failed to disconnect LinkedIn.",
    });
    expect(JSON.stringify(response.body)).not.toContain("Sensitive");
  });
});
