import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import express from "express";
import request from "supertest";

import { env } from "../config/env.js";

import {
  connectFacebookPages,
  FacebookPageConnectionError,
} from "../services/facebook/facebookPageConnectionService.js";

import { connectFacebookPagesController } from "./facebookController.js";

vi.mock("../services/facebook/facebookPageConnectionService.js", () => ({
  FacebookPageConnectionError: class FacebookPageConnectionError extends Error {
    constructor(
      message: string,
      public readonly statusCode: number,
    ) {
      super(message);
      this.name = "FacebookPageConnectionError";
    }
  },

  connectFacebookPages: vi.fn(),
}));

const workspaceId = "507f1f77bcf86cd799439011";

const sessionToken = "a".repeat(43);

const cookieName = "storm_fb_oauth_session";

const allowedOrigin = "http://localhost:5173";

const authUser = {
  id: "supabase-test-user",
};

const validBody = {
  workspaceId,
  facebookPageIds: ["123456789", "987654321"],
};

const connectedPages = [
  {
    facebookPageId: "123456789",
    pageName: "Storm Demo Business",
    status: "connected" as const,
  },
  {
    facebookPageId: "987654321",
    pageName: "Storm Demo Community",
    status: "connected" as const,
  },
];

function createTestApp(authenticated = true) {
  const app = express();

  app.use(express.json());

  // Simulate the authenticated user normally supplied
  // by requireAuth.
  //
  // Actual router authentication will be tested
  // separately in Step F.19.

  if (authenticated) {
    app.use((_req, res, next) => {
      res.locals.authUser = authUser;
      next();
    });
  }

  app.post("/api/facebook/pages/connect", connectFacebookPagesController);

  return app;
}

function validRequest(app: ReturnType<typeof createTestApp>) {
  return request(app)
    .post("/api/facebook/pages/connect")
    .set("Origin", allowedOrigin)
    .set("Cookie", `${cookieName}=${sessionToken}`)
    .send(validBody);
}

describe("POST /api/facebook/pages/connect controller", () => {
  const originalWebOrigin = env.WEB_ORIGIN;

  beforeEach(() => {
    vi.clearAllMocks();

    env.WEB_ORIGIN = allowedOrigin;

    vi.mocked(connectFacebookPages).mockResolvedValue({
      connections: connectedPages,
    });
  });

  afterAll(() => {
    env.WEB_ORIGIN = originalWebOrigin;
  });

  describe("Successful connections", () => {
    it("returns HTTP 200 when selected Pages are connected", async () => {
      const app = createTestApp();

      const response = await validRequest(app);

      expect(response.status).toBe(200);

      expect(response.body).toEqual({
        connections: connectedPages,
      });
    });

    it("passes the correct arguments to the connection service", async () => {
      const app = createTestApp();

      await validRequest(app);

      expect(connectFacebookPages).toHaveBeenCalledWith({
        sessionToken,
        authUser,
        workspaceId,
        selectedPageIds: validBody.facebookPageIds,
      });
    });

    it("supports connecting a single Facebook Page", async () => {
      const app = createTestApp();

      vi.mocked(connectFacebookPages).mockResolvedValue({
        connections: [connectedPages[0]],
      });

      const response = await request(app)
        .post("/api/facebook/pages/connect")
        .set("Origin", allowedOrigin)
        .set("Cookie", `${cookieName}=${sessionToken}`)
        .send({
          workspaceId,
          facebookPageIds: ["123456789"],
        });

      expect(response.status).toBe(200);

      expect(response.body.connections).toHaveLength(1);
    });

    it("supports connecting multiple Facebook Pages", async () => {
      const app = createTestApp();

      const response = await validRequest(app);

      expect(response.status).toBe(200);

      expect(response.body.connections).toHaveLength(2);
    });

    it("clears the temporary OAuth cookie after success", async () => {
      const app = createTestApp();

      const response = await validRequest(app);

      expect(response.status).toBe(200);

      const setCookie = response.headers["set-cookie"];

      expect(setCookie).toBeDefined();

      expect(JSON.stringify(setCookie)).toContain(`${cookieName}=`);

      expect(JSON.stringify(setCookie)).toContain("Expires=Thu, 01 Jan 1970");
    });

    it("does not expose Facebook access tokens", async () => {
      const app = createTestApp();

      const response = await validRequest(app);

      const serialized = JSON.stringify(response.body);

      expect(serialized).not.toContain("pageAccessToken");
      expect(serialized).not.toContain("access_token");
      expect(serialized).not.toContain(sessionToken);
    });
  });

  describe("Authentication", () => {
    it("rejects requests without an authenticated user", async () => {
      const app = createTestApp(false);

      const response = await validRequest(app);

      expect(response.status).toBe(401);

      expect(connectFacebookPages).not.toHaveBeenCalled();
    });
  });

  describe("Origin validation", () => {
    it("rejects requests without an Origin header", async () => {
      const app = createTestApp();

      const response = await request(app)
        .post("/api/facebook/pages/connect")
        .set("Cookie", `${cookieName}=${sessionToken}`)
        .send(validBody);

      expect(response.status).toBe(403);

      expect(connectFacebookPages).not.toHaveBeenCalled();
    });

    it("rejects unauthorized origins", async () => {
      const app = createTestApp();

      const response = await request(app)
        .post("/api/facebook/pages/connect")
        .set("Origin", "https://evil.example")
        .set("Cookie", `${cookieName}=${sessionToken}`)
        .send(validBody);

      expect(response.status).toBe(403);

      expect(connectFacebookPages).not.toHaveBeenCalled();
    });

    it("rejects malformed origins", async () => {
      const app = createTestApp();

      const response = await request(app)
        .post("/api/facebook/pages/connect")
        .set("Origin", "not-a-valid-origin")
        .set("Cookie", `${cookieName}=${sessionToken}`)
        .send(validBody);

      expect(response.status).toBe(403);

      expect(connectFacebookPages).not.toHaveBeenCalled();
    });
  });

  describe("Request validation", () => {
    it("rejects a missing request body", async () => {
      const app = createTestApp();

      const response = await request(app)
        .post("/api/facebook/pages/connect")
        .set("Origin", allowedOrigin)
        .set("Cookie", `${cookieName}=${sessionToken}`);

      expect(response.status).toBe(400);

      expect(connectFacebookPages).not.toHaveBeenCalled();
    });

    it("rejects a missing workspace ID", async () => {
      const app = createTestApp();

      const response = await request(app)
        .post("/api/facebook/pages/connect")
        .set("Origin", allowedOrigin)
        .set("Cookie", `${cookieName}=${sessionToken}`)
        .send({
          facebookPageIds: ["123456789"],
        });

      expect(response.status).toBe(400);

      expect(connectFacebookPages).not.toHaveBeenCalled();
    });

    it("rejects invalid workspace IDs", async () => {
      const app = createTestApp();

      const response = await request(app)
        .post("/api/facebook/pages/connect")
        .set("Origin", allowedOrigin)
        .set("Cookie", `${cookieName}=${sessionToken}`)
        .send({
          workspaceId: "invalid-workspace",
          facebookPageIds: ["123456789"],
        });

      expect(response.status).toBe(400);

      expect(connectFacebookPages).not.toHaveBeenCalled();
    });

    it("rejects an empty Page selection", async () => {
      const app = createTestApp();

      const response = await request(app)
        .post("/api/facebook/pages/connect")
        .set("Origin", allowedOrigin)
        .set("Cookie", `${cookieName}=${sessionToken}`)
        .send({
          workspaceId,
          facebookPageIds: [],
        });

      expect(response.status).toBe(400);

      expect(connectFacebookPages).not.toHaveBeenCalled();
    });

    it("rejects nonnumeric Facebook Page IDs", async () => {
      const app = createTestApp();

      const response = await request(app)
        .post("/api/facebook/pages/connect")
        .set("Origin", allowedOrigin)
        .set("Cookie", `${cookieName}=${sessionToken}`)
        .send({
          workspaceId,
          facebookPageIds: ["not-a-page-id"],
        });

      expect(response.status).toBe(400);

      expect(connectFacebookPages).not.toHaveBeenCalled();
    });

    it("rejects numeric Page IDs instead of strings", async () => {
      const app = createTestApp();

      const response = await request(app)
        .post("/api/facebook/pages/connect")
        .set("Origin", allowedOrigin)
        .set("Cookie", `${cookieName}=${sessionToken}`)
        .send({
          workspaceId,
          facebookPageIds: [123456789],
        });

      expect(response.status).toBe(400);

      expect(connectFacebookPages).not.toHaveBeenCalled();
    });

    it("rejects duplicate Facebook Page IDs", async () => {
      const app = createTestApp();

      const response = await request(app)
        .post("/api/facebook/pages/connect")
        .set("Origin", allowedOrigin)
        .set("Cookie", `${cookieName}=${sessionToken}`)
        .send({
          workspaceId,
          facebookPageIds: ["123456789", "123456789"],
        });

      expect(response.status).toBe(400);

      expect(connectFacebookPages).not.toHaveBeenCalled();
    });

    it("rejects more than 100 selected Pages", async () => {
      const app = createTestApp();

      const facebookPageIds = Array.from({ length: 101 }, (_, index) =>
        String(index + 1),
      );

      const response = await request(app)
        .post("/api/facebook/pages/connect")
        .set("Origin", allowedOrigin)
        .set("Cookie", `${cookieName}=${sessionToken}`)
        .send({
          workspaceId,
          facebookPageIds,
        });

      expect(response.status).toBe(400);

      expect(connectFacebookPages).not.toHaveBeenCalled();
    });
  });

  describe("OAuth session cookies", () => {
    it("rejects missing OAuth cookies", async () => {
      const app = createTestApp();

      const response = await request(app)
        .post("/api/facebook/pages/connect")
        .set("Origin", allowedOrigin)
        .send(validBody);

      expect(response.status).toBe(401);

      expect(connectFacebookPages).not.toHaveBeenCalled();
    });

    it("rejects malformed OAuth cookies", async () => {
      const app = createTestApp();

      const response = await request(app)
        .post("/api/facebook/pages/connect")
        .set("Origin", allowedOrigin)
        .set("Cookie", `${cookieName}=invalid`)
        .send(validBody);

      expect(response.status).toBe(401);

      expect(connectFacebookPages).not.toHaveBeenCalled();
    });

    it("rejects duplicate OAuth session cookies", async () => {
      const app = createTestApp();

      const response = await request(app)
        .post("/api/facebook/pages/connect")
        .set("Origin", allowedOrigin)
        .set(
          "Cookie",
          `${cookieName}=${sessionToken}; ${cookieName}=${"b".repeat(43)}`,
        )
        .send(validBody);

      expect(response.status).toBe(401);

      expect(connectFacebookPages).not.toHaveBeenCalled();
    });
  });

  describe("Connection service errors", () => {
    it("returns HTTP 403 when workspace access is denied", async () => {
      const app = createTestApp();

      vi.mocked(connectFacebookPages).mockRejectedValue(
        new FacebookPageConnectionError("Workspace access denied.", 403),
      );

      const response = await validRequest(app);

      expect(response.status).toBe(403);

      expect(response.body.message).toBe("Workspace access denied.");
    });

    it("returns HTTP 403 when publishing permission is missing", async () => {
      const app = createTestApp();

      vi.mocked(connectFacebookPages).mockRejectedValue(
        new FacebookPageConnectionError(
          "One or more selected Facebook Pages do not have publishing permission.",
          403,
        ),
      );

      const response = await validRequest(app);

      expect(response.status).toBe(403);
    });

    it("returns HTTP 404 for expired OAuth sessions", async () => {
      const app = createTestApp();

      vi.mocked(connectFacebookPages).mockRejectedValue(
        new FacebookPageConnectionError(
          "Facebook OAuth session is invalid, expired, or already used.",
          404,
        ),
      );

      const response = await validRequest(app);

      expect(response.status).toBe(404);
    });

    it("returns HTTP 500 for unexpected service failures", async () => {
      const app = createTestApp();

      vi.mocked(connectFacebookPages).mockRejectedValue(
        new Error("Sensitive MongoDB transaction error"),
      );

      const response = await validRequest(app);

      expect(response.status).toBe(500);

      expect(response.body.message).toBe("Unable to connect Facebook Pages.");

      expect(JSON.stringify(response.body)).not.toContain(
        "Sensitive MongoDB transaction error",
      );
    });

    it("preserves the OAuth cookie when connection fails", async () => {
      const app = createTestApp();

      vi.mocked(connectFacebookPages).mockRejectedValue(
        new FacebookPageConnectionError("Workspace access denied.", 403),
      );

      const response = await validRequest(app);

      expect(response.status).toBe(403);

      expect(response.headers["set-cookie"]).toBeUndefined();
    });
  });
});
