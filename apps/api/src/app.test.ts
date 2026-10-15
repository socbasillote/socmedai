import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import mongoose from "mongoose";
import { app } from "./app.js";
import { supabaseAuthClient } from "./auth/supabase.js";
import * as workspaceService from "./services/workspaceService.js";

describe("GET /api/health", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 200 when MongoDB is connected", async () => {
    vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);

    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "ok",
      service: "storm-api",
      database: "connected",
    });
    expect(response.body.timestamp).toEqual(expect.any(String));
  });

  it("returns 503 when MongoDB is disconnected", async () => {
    vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(0);

    const response = await request(app).get("/api/health");

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      status: "degraded",
      service: "storm-api",
      database: "disconnected",
    });
    expect(response.body.timestamp).toEqual(expect.any(String));
  });
});

describe("GET /api/workspaces authentication", () => {
  it("rejects requests without a Bearer token", async () => {
    const response = await request(app).get("/api/workspaces");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      error: "Unauthorized",
      message: "A valid Bearer access token is required.",
    });
  });

  it("rejects malformed Authorization headers", async () => {
    const response = await request(app)
      .get("/api/workspaces")
      .set("Authorization", "NotBearer invalid-token");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      error: "Unauthorized",
      message: "A valid Bearer access token is required.",
    });
  });
});

describe("GET /api/workspaces invalid token", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a Bearer token that Supabase considers invalid", async () => {
    vi.spyOn(supabaseAuthClient.auth, "getUser").mockResolvedValue({
      data: { user: null },
      error: {
        name: "AuthApiError",
        message: "Invalid token",
        status: 401,
        code: "invalid_token",
      },
    } as Awaited<ReturnType<typeof supabaseAuthClient.auth.getUser>>);

    const response = await request(app)
      .get("/api/workspaces")
      .set("Authorization", "Bearer invalid-test-token");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      error: "Unauthorized",
      message: "The access token is invalid or expired.",
    });
  });
});

describe("GET /api/me authentication", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the verified user identity for a valid token", async () => {
    vi.spyOn(supabaseAuthClient.auth, "getUser").mockResolvedValue({
      data: {
        user: {
          id: "test-supabase-user-id",
          email: "test@example.com",
        },
      },
      error: null,
    } as Awaited<ReturnType<typeof supabaseAuthClient.auth.getUser>>);

    const response = await request(app)
      .get("/api/me")
      .set("Authorization", "Bearer valid-test-token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      user: {
        id: "test-supabase-user-id",
        email: "test@example.com",
      },
    });
  });
});

describe("POST /api/workspaces validation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a blank workspace name", async () => {
    vi.spyOn(supabaseAuthClient.auth, "getUser").mockResolvedValue({
      data: {
        user: {
          id: "test-supabase-user-id",
          email: "test@example.com",
        },
      },
      error: null,
    } as Awaited<ReturnType<typeof supabaseAuthClient.auth.getUser>>);

    const createWorkspaceSpy = vi.spyOn(
      workspaceService,
      "createUserWorkspace",
    );

    const response = await request(app)
      .post("/api/workspaces")
      .set("Authorization", "Bearer valid-test-token")
      .send({ name: "   " });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: "Validation failed",
      message: "Workspace name is required.",
    });
    expect(createWorkspaceSpy).not.toHaveBeenCalled();
  });

  it("creates a workspace with a valid name", async () => {
    vi.spyOn(supabaseAuthClient.auth, "getUser").mockResolvedValue({
      data: {
        user: {
          id: "test-supabase-user-id",
          email: "test@example.com",
        },
      },
      error: null,
    } as Awaited<ReturnType<typeof supabaseAuthClient.auth.getUser>>);

    const createdWorkspace = {
      _id: "507f1f77bcf86cd799439011",
      name: "Storm Test",
      ownerUserId: "507f1f77bcf86cd799439012",
      settings: {},
      createdAt: "2026-10-15T00:00:00.000Z",
      updatedAt: "2026-10-15T00:00:00.000Z",
    };

    const createWorkspaceSpy = vi
      .spyOn(workspaceService, "createUserWorkspace")
      .mockResolvedValue(createdWorkspace as never);

    const response = await request(app)
      .post("/api/workspaces")
      .set("Authorization", "Bearer valid-test-token")
      .send({ name: "  Storm Test  " });

    expect(response.status).toBe(201);
    expect(response.body.workspace).toMatchObject({
      _id: createdWorkspace._id,
      name: "Storm Test",
      ownerUserId: createdWorkspace.ownerUserId,
    });
    expect(createWorkspaceSpy).toHaveBeenCalledWith(
      {
        id: "test-supabase-user-id",
        email: "test@example.com",
      },
      "Storm Test",
    );
  });
});

describe("GET /api/workspaces/:workspaceId authorization", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 404 when the workspace is not owned by the user", async () => {
    vi.spyOn(supabaseAuthClient.auth, "getUser").mockResolvedValue({
      data: {
        user: {
          id: "test-supabase-user-id",
          email: "test@example.com",
        },
      },
      error: null,
    } as Awaited<ReturnType<typeof supabaseAuthClient.auth.getUser>>);

    const getWorkspaceSpy = vi
      .spyOn(workspaceService, "getUserWorkspaceById")
      .mockResolvedValue(null);

    const workspaceId = "507f1f77bcf86cd799439011";

    const response = await request(app)
      .get(`/api/workspaces/${workspaceId}`)
      .set("Authorization", "Bearer valid-test-token");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: "Workspace not found",
    });
    expect(getWorkspaceSpy).toHaveBeenCalledWith(
      {
        id: "test-supabase-user-id",
        email: "test@example.com",
      },
      workspaceId,
    );
  });

  it("returns 404 for a malformed workspace ID without querying the service", async () => {
    vi.spyOn(supabaseAuthClient.auth, "getUser").mockResolvedValue({
      data: {
        user: {
          id: "test-supabase-user-id",
          email: "test@example.com",
        },
      },
      error: null,
    } as Awaited<ReturnType<typeof supabaseAuthClient.auth.getUser>>);

    const getWorkspaceSpy = vi.spyOn(workspaceService, "getUserWorkspaceById");

    const response = await request(app)
      .get("/api/workspaces/not-a-valid-id")
      .set("Authorization", "Bearer valid-test-token");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: "Workspace not found",
    });
    expect(getWorkspaceSpy).not.toHaveBeenCalled();
  });
});
