import express from "express";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { env } from "../config/env.js";

import { FacebookAuthorizationError } from "../services/facebook/facebookAuthorizationService.js";

vi.mock("../services/facebook/facebookCallbackService.js", () => ({
  completeFacebookOAuthCallback: vi.fn(),
}));

vi.mock("../services/facebook/facebookOAuthStateService.js", () => ({
  consumeFacebookOAuthState: vi.fn(),
}));

vi.mock("../services/facebook/facebookOAuthCookieService.js", () => ({
  setFacebookOAuthSessionCookie: vi.fn((res, token: string) => {
    res.cookie("storm_fb_oauth_session", token, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/api/facebook",
      maxAge: 600_000,
    });
  }),

  clearFacebookOAuthSessionCookie: vi.fn((res) => {
    res.clearCookie("storm_fb_oauth_session", {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/api/facebook",
    });
  }),
}));

import {
  startFacebookConnect,
  facebookOAuthCallback,
} from "./facebookController.js";

const mocks = vi.hoisted(() => ({
  createFacebookAuthorizationUrl: vi.fn(),
}));

vi.mock(
  "../services/facebook/facebookAuthorizationService.js",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("../services/facebook/facebookAuthorizationService.js")
      >();

    return {
      ...original,
      createFacebookAuthorizationUrl: mocks.createFacebookAuthorizationUrl,
    };
  },
);

const testAuthUser = {
  id: "facebook-controller-test-user",
  email: "facebook-controller@example.test",
};

function createTestApp(authenticated = true) {
  const app = express();

  app.use(express.json());

  app.post(
    "/api/facebook/connect",
    (req, res, next) => {
      if (!authenticated) {
        res.status(401).json({
          error: "Authentication is required.",
        });
        return;
      }

      res.locals.authUser = testAuthUser;
      next();
    },
    startFacebookConnect,
  );

  app.use(
    (
      _error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(500).json({
        error: "Internal server error",
      });
    },
  );

  return app;
}

describe("Facebook OAuth start controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an authorization URL for a valid authenticated request", async () => {
    const authorizationUrl =
      "https://www.facebook.com/v24.0/dialog/oauth?state=test-state";

    mocks.createFacebookAuthorizationUrl.mockResolvedValue(authorizationUrl);

    const app = createTestApp();

    const response = await request(app).post("/api/facebook/connect").send({
      workspaceId: "507f1f77bcf86cd799439011",
    });

    expect(response.status).toBe(200);

    expect(response.body).toEqual({
      authorizationUrl,
    });

    expect(mocks.createFacebookAuthorizationUrl).toHaveBeenCalledWith(
      testAuthUser,
      "507f1f77bcf86cd799439011",
    );
  });

  it("rejects requests without a workspace ID", async () => {
    const app = createTestApp();

    const response = await request(app).post("/api/facebook/connect").send({});

    expect(response.status).toBe(400);

    expect(response.body).toEqual({
      error: "A valid workspaceId is required.",
    });

    expect(mocks.createFacebookAuthorizationUrl).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests", async () => {
    const app = createTestApp(false);

    const response = await request(app).post("/api/facebook/connect").send({
      workspaceId: "507f1f77bcf86cd799439011",
    });

    expect(response.status).toBe(401);

    expect(mocks.createFacebookAuthorizationUrl).not.toHaveBeenCalled();
  });

  it("returns the authorization service error status", async () => {
    const app = createTestApp();

    const authorizationError = Object.assign(
      new Error("Workspace access denied."),
      {
        name: "FacebookAuthorizationError",
        statusCode: 403,
      },
    );

    Object.setPrototypeOf(
      authorizationError,
      FacebookAuthorizationError.prototype,
    );

    mocks.createFacebookAuthorizationUrl.mockRejectedValue(authorizationError);

    const response = await request(app).post("/api/facebook/connect").send({
      workspaceId: "507f1f77bcf86cd799439011",
    });

    expect(response.status).toBe(403);

    expect(response.body).toEqual({
      error: "Workspace access denied.",
    });
  });

  it("forwards unexpected errors to the centralized error handler", async () => {
    const app = createTestApp();

    mocks.createFacebookAuthorizationUrl.mockRejectedValue(
      new Error("Unexpected internal failure."),
    );

    const response = await request(app).post("/api/facebook/connect").send({
      workspaceId: "507f1f77bcf86cd799439011",
    });

    expect(response.status).toBe(500);

    expect(response.body).toEqual({
      error: "Internal server error",
    });

    expect(JSON.stringify(response.body)).not.toContain(
      "Unexpected internal failure",
    );
  });
});

describe("GET /api/facebook/callback", () => {
  const validState = "a".repeat(43);
  const authorizationCode = "facebook-test-authorization-code";
  const sessionToken = "b".repeat(43);

  const originalWebOrigin = env.WEB_ORIGIN;

  const callbackApp = express();

  callbackApp.get("/api/facebook/callback", facebookOAuthCallback);

  beforeEach(async () => {
    vi.clearAllMocks();

    env.WEB_ORIGIN = "http://localhost:5173";

    const callbackService =
      await import("../services/facebook/facebookCallbackService.js");

    vi.mocked(callbackService.completeFacebookOAuthCallback).mockResolvedValue({
      workspaceId: "507f1f77bcf86cd799439011",
      sessionToken,
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      pages: [],
    });
  });

  afterAll(() => {
    env.WEB_ORIGIN = originalWebOrigin;
  });

  it("redirects successfully after Facebook authorization", async () => {
    const response = await request(callbackApp)
      .get("/api/facebook/callback")
      .query({
        code: authorizationCode,
        state: validState,
      });

    expect(response.status).toBe(302);

    expect(response.headers.location).toBe(
      "http://localhost:5173/?facebook=connected",
    );
  });

  it("sets an HTTP-only temporary session cookie", async () => {
    const response = await request(callbackApp)
      .get("/api/facebook/callback")
      .query({
        code: authorizationCode,
        state: validState,
      });

    expect(response.status).toBe(302);

    const cookies = response.headers["set-cookie"];

    expect(cookies).toBeDefined();

    const serializedCookies = Array.isArray(cookies)
      ? cookies.join("; ")
      : String(cookies);

    expect(serializedCookies).toContain(
      `storm_fb_oauth_session=${sessionToken}`,
    );

    expect(serializedCookies).toContain("HttpOnly");
    expect(serializedCookies).toContain("SameSite=Lax");
    expect(serializedCookies).toContain("Path=/api/facebook");
  });

  it("does not expose credentials in the redirect URL", async () => {
    const response = await request(callbackApp)
      .get("/api/facebook/callback")
      .query({
        code: authorizationCode,
        state: validState,
      });

    const location = response.headers.location as string;

    expect(location).not.toContain(authorizationCode);
    expect(location).not.toContain(validState);
    expect(location).not.toContain(sessionToken);
  });

  it("passes the authorization code and state to the orchestration service", async () => {
    const callbackService =
      await import("../services/facebook/facebookCallbackService.js");

    await request(callbackApp).get("/api/facebook/callback").query({
      code: authorizationCode,
      state: validState,
    });

    expect(callbackService.completeFacebookOAuthCallback).toHaveBeenCalledWith({
      code: authorizationCode,
      state: validState,
    });
  });

  it("handles denied Facebook authorization", async () => {
    const oauthStateService =
      await import("../services/facebook/facebookOAuthStateService.js");

    const response = await request(callbackApp)
      .get("/api/facebook/callback")
      .query({
        error: "access_denied",
        state: validState,
      });

    expect(response.status).toBe(302);

    expect(response.headers.location).toBe(
      "http://localhost:5173/?facebook=error&reason=denied",
    );

    expect(oauthStateService.consumeFacebookOAuthState).toHaveBeenCalledWith({
      state: validState,
    });
  });

  it("does not complete OAuth after authorization denial", async () => {
    const callbackService =
      await import("../services/facebook/facebookCallbackService.js");

    await request(callbackApp).get("/api/facebook/callback").query({
      error: "access_denied",
      state: validState,
    });

    expect(
      callbackService.completeFacebookOAuthCallback,
    ).not.toHaveBeenCalled();
  });

  it("handles an expired or invalid state during denial", async () => {
    const oauthStateService =
      await import("../services/facebook/facebookOAuthStateService.js");

    vi.mocked(oauthStateService.consumeFacebookOAuthState).mockRejectedValue(
      new Error("Invalid OAuth state"),
    );

    const response = await request(callbackApp)
      .get("/api/facebook/callback")
      .query({
        error: "access_denied",
        state: validState,
      });

    expect(response.status).toBe(302);

    expect(response.headers.location).toContain("facebook=error");
  });

  it("rejects a callback missing the authorization code", async () => {
    const response = await request(callbackApp)
      .get("/api/facebook/callback")
      .query({
        state: validState,
      });

    expect(response.status).toBe(302);

    expect(response.headers.location).toBe(
      "http://localhost:5173/?facebook=error&reason=failed",
    );
  });

  it("rejects a callback missing the OAuth state", async () => {
    const response = await request(callbackApp)
      .get("/api/facebook/callback")
      .query({
        code: authorizationCode,
      });

    expect(response.status).toBe(302);

    expect(response.headers.location).toBe(
      "http://localhost:5173/?facebook=error&reason=failed",
    );
  });

  it("does not call the orchestration service for malformed callbacks", async () => {
    const callbackService =
      await import("../services/facebook/facebookCallbackService.js");

    await request(callbackApp).get("/api/facebook/callback").query({
      code: authorizationCode,
    });

    expect(
      callbackService.completeFacebookOAuthCallback,
    ).not.toHaveBeenCalled();
  });

  it("handles OAuth orchestration failures safely", async () => {
    const callbackService =
      await import("../services/facebook/facebookCallbackService.js");

    vi.mocked(callbackService.completeFacebookOAuthCallback).mockRejectedValue(
      new Error("Sensitive Facebook provider error"),
    );

    const response = await request(callbackApp)
      .get("/api/facebook/callback")
      .query({
        code: authorizationCode,
        state: validState,
      });

    expect(response.status).toBe(302);

    expect(response.headers.location).toBe(
      "http://localhost:5173/?facebook=error&reason=failed",
    );

    expect(response.headers.location).not.toContain(
      "Sensitive Facebook provider error",
    );
  });

  it("clears stale session cookies when OAuth fails", async () => {
    const callbackService =
      await import("../services/facebook/facebookCallbackService.js");

    vi.mocked(callbackService.completeFacebookOAuthCallback).mockRejectedValue(
      new Error("OAuth failed"),
    );

    const response = await request(callbackApp)
      .get("/api/facebook/callback")
      .query({
        code: authorizationCode,
        state: validState,
      });

    const cookies = response.headers["set-cookie"];

    const serializedCookies = Array.isArray(cookies)
      ? cookies.join("; ")
      : String(cookies);

    expect(serializedCookies).toContain("storm_fb_oauth_session=");

    expect(serializedCookies).toContain("Expires=Thu, 01 Jan 1970");
  });

  it("does not require Supabase bearer authentication", async () => {
    const response = await request(callbackApp)
      .get("/api/facebook/callback")
      .query({
        code: authorizationCode,
        state: validState,
      });

    expect(response.status).toBe(302);
  });

  it("does not connect Facebook Pages automatically", async () => {
    const callbackService =
      await import("../services/facebook/facebookCallbackService.js");

    await request(callbackApp).get("/api/facebook/callback").query({
      code: authorizationCode,
      state: validState,
    });

    expect(callbackService.completeFacebookOAuthCallback).toHaveBeenCalledTimes(
      1,
    );

    // Permanent Facebook Page connections are performed
    // through the separate authenticated selection endpoint.
  });
});
