import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  startFacebookConnect: vi.fn(),
  facebookOAuthCallback: vi.fn(),
  getFacebookOAuthSessionController: vi.fn(),
  connectFacebookPagesController: vi.fn(),
}));

vi.mock("../auth/requireAuth.js", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("../controllers/facebookController.js", () => ({
  startFacebookConnect: mocks.startFacebookConnect,
  facebookOAuthCallback: mocks.facebookOAuthCallback,
  getFacebookOAuthSessionController: mocks.getFacebookOAuthSessionController,
  connectFacebookPagesController: mocks.connectFacebookPagesController,
  getFacebookConnectionsController: vi.fn((_req, res) => {
    res.status(200).json({
      connections: [],
    });
  }),
}));

import facebookRoutes from "./facebookRoutes.js";

const workspaceId = "507f1f77bcf86cd799439011";

function createTestApp() {
  const app = express();

  app.use(express.json());

  // Mount the actual production Facebook router.
  app.use("/api/facebook", facebookRoutes);

  return app;
}

describe("Facebook routes authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Simulate requireAuth rejecting requests without
    // a valid Supabase bearer token.
    mocks.requireAuth.mockImplementation((req, res, next) => {
      const authorization = req.headers.authorization;

      if (authorization !== "Bearer valid-test-token") {
        res.status(401).json({
          message: "Authentication is required.",
        });

        return;
      }

      res.locals.authUser = {
        id: "supabase-test-user",
      };

      next();
    });

    mocks.getFacebookOAuthSessionController.mockImplementation((_req, res) => {
      res.status(200).json({
        workspaceId,
        pages: [],
      });
    });

    mocks.startFacebookConnect.mockImplementation((_req, res) => {
      res.status(200).json({
        authorizationUrl: "https://example.test/facebook-oauth",
      });
    });

    mocks.facebookOAuthCallback.mockImplementation((_req, res) => {
      res.redirect(302, "http://localhost:5173/?facebook=connected");
    });

    mocks.connectFacebookPagesController.mockImplementation((_req, res) => {
      res.status(200).json({
        connections: [],
      });
    });
  });

  it("rejects unauthenticated OAuth session requests", async () => {
    const app = createTestApp();

    const response = await request(app)
      .get("/api/facebook/oauth/session")
      .query({ workspaceId });

    expect(response.status).toBe(401);

    expect(mocks.getFacebookOAuthSessionController).not.toHaveBeenCalled();
  });

  it("rejects invalid bearer tokens", async () => {
    const app = createTestApp();

    const response = await request(app)
      .get("/api/facebook/oauth/session")
      .query({ workspaceId })
      .set("Authorization", "Bearer invalid-token");

    expect(response.status).toBe(401);

    expect(mocks.getFacebookOAuthSessionController).not.toHaveBeenCalled();
  });

  it("allows authenticated requests to reach the session controller", async () => {
    const app = createTestApp();

    const response = await request(app)
      .get("/api/facebook/oauth/session")
      .query({ workspaceId })
      .set("Authorization", "Bearer valid-test-token");

    expect(response.status).toBe(200);

    expect(response.body).toEqual({
      workspaceId,
      pages: [],
    });

    expect(mocks.getFacebookOAuthSessionController).toHaveBeenCalledTimes(1);
  });

  it("runs authentication middleware before the session controller", async () => {
    const app = createTestApp();

    await request(app)
      .get("/api/facebook/oauth/session")
      .query({ workspaceId })
      .set("Authorization", "Bearer valid-test-token");

    expect(mocks.requireAuth).toHaveBeenCalledTimes(1);

    expect(mocks.getFacebookOAuthSessionController).toHaveBeenCalledTimes(1);

    expect(mocks.requireAuth.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getFacebookOAuthSessionController.mock.invocationCallOrder[0],
    );
  });

  it("keeps the Facebook OAuth callback public", async () => {
    const app = createTestApp();

    const response = await request(app)
      .get("/api/facebook/callback")
      .query({
        code: "test-code",
        state: "a".repeat(43),
      });

    expect(response.status).toBe(302);

    expect(mocks.facebookOAuthCallback).toHaveBeenCalledTimes(1);

    expect(mocks.requireAuth).not.toHaveBeenCalled();
  });

  it("keeps the Facebook connect endpoint protected", async () => {
    const app = createTestApp();

    const response = await request(app).post("/api/facebook/connect").send({
      workspaceId,
    });

    expect(response.status).toBe(401);

    expect(mocks.startFacebookConnect).not.toHaveBeenCalled();
  });

  it("allows authenticated Facebook connect requests", async () => {
    const app = createTestApp();

    const response = await request(app)
      .post("/api/facebook/connect")
      .set("Authorization", "Bearer valid-test-token")
      .send({
        workspaceId,
      });

    expect(response.status).toBe(200);

    expect(mocks.startFacebookConnect).toHaveBeenCalledTimes(1);
  });

  it("does not accept a session cookie as a replacement for authentication", async () => {
    const app = createTestApp();

    const response = await request(app)
      .get("/api/facebook/oauth/session")
      .query({ workspaceId })
      .set("Cookie", `storm_fb_oauth_session=${"a".repeat(43)}`);

    expect(response.status).toBe(401);

    expect(mocks.getFacebookOAuthSessionController).not.toHaveBeenCalled();
  });
});

describe("POST /api/facebook/pages/connect route security", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Simulate the existing requireAuth middleware.
    //
    // This verifies the router's middleware wiring,
    // not Supabase JWT cryptographic validation.
    mocks.requireAuth.mockImplementation((req, res, next) => {
      const authorization = req.headers.authorization;

      if (authorization !== "Bearer valid-test-token") {
        res.status(401).json({
          message: "Authentication is required.",
        });

        return;
      }

      res.locals.authUser = {
        id: "supabase-test-user",
      };

      next();
    });

    mocks.connectFacebookPagesController.mockImplementation((_req, res) => {
      res.status(200).json({
        connections: [
          {
            facebookPageId: "123456789",
            pageName: "Storm Demo Business",
            status: "connected",
          },
        ],
      });
    });
  });

  const validBody = {
    workspaceId,
    facebookPageIds: ["123456789"],
  };

  it("rejects requests without authentication", async () => {
    const app = createTestApp();

    const response = await request(app)
      .post("/api/facebook/pages/connect")
      .send(validBody);

    expect(response.status).toBe(401);

    expect(mocks.requireAuth).toHaveBeenCalledTimes(1);

    expect(mocks.connectFacebookPagesController).not.toHaveBeenCalled();
  });

  it("rejects invalid bearer tokens", async () => {
    const app = createTestApp();

    const response = await request(app)
      .post("/api/facebook/pages/connect")
      .set("Authorization", "Bearer invalid-token")
      .send(validBody);

    expect(response.status).toBe(401);

    expect(mocks.connectFacebookPagesController).not.toHaveBeenCalled();
  });

  it("allows authenticated requests to reach the controller", async () => {
    const app = createTestApp();

    const response = await request(app)
      .post("/api/facebook/pages/connect")
      .set("Authorization", "Bearer valid-test-token")
      .send(validBody);

    expect(response.status).toBe(200);

    expect(response.body).toEqual({
      connections: [
        {
          facebookPageId: "123456789",
          pageName: "Storm Demo Business",
          status: "connected",
        },
      ],
    });

    expect(mocks.connectFacebookPagesController).toHaveBeenCalledTimes(1);
  });

  it("executes authentication before the controller", async () => {
    const app = createTestApp();

    await request(app)
      .post("/api/facebook/pages/connect")
      .set("Authorization", "Bearer valid-test-token")
      .send(validBody);

    expect(mocks.requireAuth).toHaveBeenCalledTimes(1);

    expect(mocks.connectFacebookPagesController).toHaveBeenCalledTimes(1);

    expect(mocks.requireAuth.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.connectFacebookPagesController.mock.invocationCallOrder[0],
    );
  });

  it("does not accept an OAuth cookie instead of authentication", async () => {
    const app = createTestApp();

    const response = await request(app)
      .post("/api/facebook/pages/connect")
      .set("Cookie", `storm_fb_oauth_session=${"a".repeat(43)}`)
      .send(validBody);

    expect(response.status).toBe(401);

    expect(mocks.connectFacebookPagesController).not.toHaveBeenCalled();
  });

  it("does not bypass authentication when Origin is valid", async () => {
    const app = createTestApp();

    const response = await request(app)
      .post("/api/facebook/pages/connect")
      .set("Origin", "http://localhost:5173")
      .send(validBody);

    expect(response.status).toBe(401);

    expect(mocks.connectFacebookPagesController).not.toHaveBeenCalled();
  });

  it("does not bypass authentication with a cookie and Origin", async () => {
    const app = createTestApp();

    const response = await request(app)
      .post("/api/facebook/pages/connect")
      .set("Origin", "http://localhost:5173")
      .set("Cookie", `storm_fb_oauth_session=${"a".repeat(43)}`)
      .send(validBody);

    expect(response.status).toBe(401);

    expect(mocks.connectFacebookPagesController).not.toHaveBeenCalled();
  });

  it("preserves the existing Facebook connect route", async () => {
    const app = createTestApp();

    // Configure the existing connect handler explicitly.
    mocks.startFacebookConnect.mockImplementation((_req, res) => {
      res.status(200).json({
        authorizationUrl: "https://example.test/facebook-oauth",
      });
    });

    const response = await request(app)
      .post("/api/facebook/connect")
      .set("Authorization", "Bearer valid-test-token")
      .send({
        workspaceId,
      });

    expect(response.status).toBe(200);

    expect(mocks.startFacebookConnect).toHaveBeenCalledTimes(1);
  });

  it("preserves the public Facebook OAuth callback", async () => {
    const app = createTestApp();

    mocks.facebookOAuthCallback.mockImplementation((_req, res) => {
      res.redirect(302, "http://localhost:5173/?facebook=connected");
    });

    const response = await request(app)
      .get("/api/facebook/callback")
      .query({
        code: "test-code",
        state: "a".repeat(43),
      });

    expect(response.status).toBe(302);

    expect(mocks.facebookOAuthCallback).toHaveBeenCalledTimes(1);

    expect(mocks.requireAuth).not.toHaveBeenCalled();
  });

  it("preserves authentication on the OAuth session route", async () => {
    const app = createTestApp();

    const response = await request(app)
      .get("/api/facebook/oauth/session")
      .query({
        workspaceId,
      });

    expect(response.status).toBe(401);

    expect(mocks.getFacebookOAuthSessionController).not.toHaveBeenCalled();
  });
});
