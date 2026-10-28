import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

import {
  FacebookOAuthSessionError,
  getFacebookOAuthSession,
} from "../services/facebook/facebookOAuthSessionService.js";

import { getFacebookOAuthSessionController } from "./facebookController.js";

// Mock external services.
//
// These mocks must be registered before the controller
// is executed by the tests.

vi.mock("../services/facebook/facebookOAuthSessionService.js", () => ({
  FacebookOAuthSessionError: class FacebookOAuthSessionError extends Error {
    constructor(
      message: string,
      public readonly statusCode: number,
    ) {
      super(message);
      this.name = "FacebookOAuthSessionError";
    }
  },

  getFacebookOAuthSession: vi.fn(),
}));

vi.mock("../services/facebook/facebookAuthorizationService.js", () => ({
  FacebookAuthorizationError: class FacebookAuthorizationError extends Error {
    constructor(
      message: string,
      public readonly statusCode: number,
    ) {
      super(message);
      this.name = "FacebookAuthorizationError";
    }
  },

  createFacebookAuthorizationUrl: vi.fn(),
}));

vi.mock("../services/facebook/facebookCallbackService.js", () => ({
  completeFacebookOAuthCallback: vi.fn(),
}));

vi.mock("../services/facebook/facebookOAuthStateService.js", () => ({
  consumeFacebookOAuthState: vi.fn(),
}));

const workspaceId = "507f1f77bcf86cd799439011";

const sessionToken = "a".repeat(43);

const cookieName = "storm_fb_oauth_session";

const authUser = {
  id: "supabase-test-user",
};

function createTestApp(authenticated = true) {
  const app = express();

  app.use(express.json());

  // Simulate the authenticated user that requireAuth
  // normally attaches to res.locals.
  //
  // Actual middleware enforcement will be tested
  // separately in Step F.12B.

  if (authenticated) {
    app.use((_req, res, next) => {
      res.locals.authUser = authUser;
      next();
    });
  }

  app.get("/api/facebook/oauth/session", getFacebookOAuthSessionController);

  return app;
}

describe("GET /api/facebook/oauth/session controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getFacebookOAuthSession).mockResolvedValue({
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),

      pages: [
        {
          facebookPageId: "123456789",
          pageName: "Storm Demo Business",
          tasks: ["CREATE_CONTENT", "MANAGE"],
        },

        {
          facebookPageId: "987654321",
          pageName: "Storm Demo Community",
          tasks: ["CREATE_CONTENT"],
        },
      ],
    });
  });

  it("returns HTTP 200 for a valid session", async () => {
    const app = createTestApp();

    const response = await request(app)
      .get("/api/facebook/oauth/session")
      .query({ workspaceId })
      .set("Cookie", `${cookieName}=${sessionToken}`);

    expect(response.status).toBe(200);

    expect(response.body.workspaceId).toBe(workspaceId);

    expect(response.body.pages).toHaveLength(2);
  });

  it("returns the expected safe Page metadata", async () => {
    const app = createTestApp();

    const response = await request(app)
      .get("/api/facebook/oauth/session")
      .query({ workspaceId })
      .set("Cookie", `${cookieName}=${sessionToken}`);

    expect(response.status).toBe(200);

    expect(response.body).toEqual({
      workspaceId,

      expiresAt: "2030-01-01T00:00:00.000Z",

      pages: [
        {
          facebookPageId: "123456789",
          pageName: "Storm Demo Business",
          tasks: ["CREATE_CONTENT", "MANAGE"],
        },

        {
          facebookPageId: "987654321",
          pageName: "Storm Demo Community",
          tasks: ["CREATE_CONTENT"],
        },
      ],
    });
  });

  it("passes the authenticated user and workspace to the service", async () => {
    const app = createTestApp();

    await request(app)
      .get("/api/facebook/oauth/session")
      .query({ workspaceId })
      .set("Cookie", `${cookieName}=${sessionToken}`);

    expect(getFacebookOAuthSession).toHaveBeenCalledWith({
      sessionToken,
      authUser,
      workspaceId,
    });
  });

  it("rejects requests without an authenticated user", async () => {
    const app = createTestApp(false);

    const response = await request(app)
      .get("/api/facebook/oauth/session")
      .query({ workspaceId })
      .set("Cookie", `${cookieName}=${sessionToken}`);

    expect(response.status).toBe(401);

    expect(getFacebookOAuthSession).not.toHaveBeenCalled();
  });

  it("rejects requests without a workspace ID", async () => {
    const app = createTestApp();

    const response = await request(app)
      .get("/api/facebook/oauth/session")
      .set("Cookie", `${cookieName}=${sessionToken}`);

    expect(response.status).toBe(400);

    expect(getFacebookOAuthSession).not.toHaveBeenCalled();
  });

  it("rejects invalid workspace IDs", async () => {
    const app = createTestApp();

    const response = await request(app)
      .get("/api/facebook/oauth/session")
      .query({ workspaceId: "invalid-workspace" })
      .set("Cookie", `${cookieName}=${sessionToken}`);

    expect(response.status).toBe(400);

    expect(getFacebookOAuthSession).not.toHaveBeenCalled();
  });

  it("rejects missing session cookies", async () => {
    const app = createTestApp();

    const response = await request(app)
      .get("/api/facebook/oauth/session")
      .query({ workspaceId });

    expect(response.status).toBe(401);

    expect(getFacebookOAuthSession).not.toHaveBeenCalled();
  });

  it("rejects malformed session cookies", async () => {
    const app = createTestApp();

    const response = await request(app)
      .get("/api/facebook/oauth/session")
      .query({ workspaceId })
      .set("Cookie", `${cookieName}=invalid-token`);

    expect(response.status).toBe(401);

    expect(getFacebookOAuthSession).not.toHaveBeenCalled();
  });

  it("rejects duplicate session cookies", async () => {
    const app = createTestApp();

    const response = await request(app)
      .get("/api/facebook/oauth/session")
      .query({ workspaceId })
      .set(
        "Cookie",
        `${cookieName}=${sessionToken}; ${cookieName}=${"b".repeat(43)}`,
      );

    expect(response.status).toBe(401);

    expect(getFacebookOAuthSession).not.toHaveBeenCalled();
  });

  it("returns HTTP 403 when workspace access is denied", async () => {
    const app = createTestApp();

    vi.mocked(getFacebookOAuthSession).mockRejectedValue(
      new FacebookOAuthSessionError("Workspace access denied.", 403),
    );

    const response = await request(app)
      .get("/api/facebook/oauth/session")
      .query({ workspaceId })
      .set("Cookie", `${cookieName}=${sessionToken}`);

    expect(response.status).toBe(403);

    expect(response.body.message).toBe("Workspace access denied.");
  });

  it("returns HTTP 404 for an expired session", async () => {
    const app = createTestApp();

    vi.mocked(getFacebookOAuthSession).mockRejectedValue(
      new FacebookOAuthSessionError(
        "Facebook OAuth session is invalid or expired.",
        404,
      ),
    );

    const response = await request(app)
      .get("/api/facebook/oauth/session")
      .query({ workspaceId })
      .set("Cookie", `${cookieName}=${sessionToken}`);

    expect(response.status).toBe(404);

    expect(response.body.message).toBe(
      "Facebook OAuth session is invalid or expired.",
    );
  });

  it("does not expose Facebook access tokens", async () => {
    const app = createTestApp();

    const response = await request(app)
      .get("/api/facebook/oauth/session")
      .query({ workspaceId })
      .set("Cookie", `${cookieName}=${sessionToken}`);

    const serializedResponse = JSON.stringify(response.body);

    expect(serializedResponse).not.toContain("pageAccessToken");

    expect(serializedResponse).not.toContain("access_token");

    expect(serializedResponse).not.toContain(sessionToken);
  });

  it("does not clear the temporary session cookie", async () => {
    const app = createTestApp();

    const response = await request(app)
      .get("/api/facebook/oauth/session")
      .query({ workspaceId })
      .set("Cookie", `${cookieName}=${sessionToken}`);

    expect(response.status).toBe(200);

    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("does not consume the session during retrieval", async () => {
    const app = createTestApp();

    const firstResponse = await request(app)
      .get("/api/facebook/oauth/session")
      .query({ workspaceId })
      .set("Cookie", `${cookieName}=${sessionToken}`);

    const secondResponse = await request(app)
      .get("/api/facebook/oauth/session")
      .query({ workspaceId })
      .set("Cookie", `${cookieName}=${sessionToken}`);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);

    expect(getFacebookOAuthSession).toHaveBeenCalledTimes(2);
  });

  it("returns a generic error for unexpected service failures", async () => {
    const app = createTestApp();

    vi.mocked(getFacebookOAuthSession).mockRejectedValue(
      new Error("Sensitive internal database error"),
    );

    const response = await request(app)
      .get("/api/facebook/oauth/session")
      .query({ workspaceId })
      .set("Cookie", `${cookieName}=${sessionToken}`);

    expect(response.status).toBe(500);

    expect(response.body.message).toBe(
      "Unable to retrieve Facebook authorization session.",
    );

    expect(JSON.stringify(response.body)).not.toContain(
      "Sensitive internal database error",
    );
  });
});
