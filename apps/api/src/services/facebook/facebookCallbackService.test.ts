import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consumeFacebookOAuthState: vi.fn(),
  exchangeFacebookAuthorizationCode: vi.fn(),
  exchangeFacebookLongLivedToken: vi.fn(),
  getFacebookUserIdentity: vi.fn(),
  discoverFacebookPages: vi.fn(),
  createFacebookOAuthSession: vi.fn(),
}));

vi.mock("./facebookOAuthStateService.js", () => ({
  consumeFacebookOAuthState: mocks.consumeFacebookOAuthState,
  FacebookOAuthStateError: class FacebookOAuthStateError extends Error {
    constructor(
      message: string,
      public readonly statusCode: number,
    ) {
      super(message);
    }
  },
}));

vi.mock("./facebookTokenService.js", () => ({
  exchangeFacebookAuthorizationCode: mocks.exchangeFacebookAuthorizationCode,
  FacebookTokenExchangeError: class FacebookTokenExchangeError extends Error {
    constructor(
      message: string,
      public readonly statusCode: number,
    ) {
      super(message);
    }
  },
}));

vi.mock("./facebookLongLivedTokenService.js", () => ({
  exchangeFacebookLongLivedToken: mocks.exchangeFacebookLongLivedToken,
  FacebookLongLivedTokenError: class FacebookLongLivedTokenError extends Error {
    constructor(
      message: string,
      public readonly statusCode: number,
    ) {
      super(message);
    }
  },
}));

vi.mock("./facebookUserIdentityService.js", () => ({
  getFacebookUserIdentity: mocks.getFacebookUserIdentity,
  FacebookUserIdentityError: class FacebookUserIdentityError extends Error {
    constructor(
      message: string,
      public readonly statusCode: number,
    ) {
      super(message);
    }
  },
}));

vi.mock("./facebookPageDiscoveryService.js", () => ({
  discoverFacebookPages: mocks.discoverFacebookPages,
  FacebookPageDiscoveryError: class FacebookPageDiscoveryError extends Error {
    constructor(
      message: string,
      public readonly statusCode: number,
    ) {
      super(message);
    }
  },
}));

vi.mock("./facebookOAuthSessionService.js", () => ({
  createFacebookOAuthSession: mocks.createFacebookOAuthSession,
  FacebookOAuthSessionError: class FacebookOAuthSessionError extends Error {
    constructor(
      message: string,
      public readonly statusCode: number,
    ) {
      super(message);
    }
  },
}));

import {
  completeFacebookOAuthCallback,
  FacebookCallbackError,
} from "./facebookCallbackService.js";

describe("Facebook OAuth Callback Orchestration", () => {
  const state = "a".repeat(43);
  const code = "facebook-test-authorization-code";

  const supabaseUserId = "storm-user-123";
  const workspaceId = "507f1f77bcf86cd799439011";
  const facebookUserId = "facebook-user-456";

  const shortLivedToken = "short-lived-user-token";
  const longLivedToken = "long-lived-user-token";
  const pageAccessToken = "sensitive-page-access-token";

  const expiresAt = new Date("2030-01-01T00:00:00.000Z");

  const pages = [
    {
      facebookPageId: "facebook-page-123",
      pageName: "Storm Test Page",
      pageAccessToken,
      tasks: ["CREATE_CONTENT", "MODERATE"],
    },
  ];

  beforeEach(() => {
    vi.resetAllMocks();

    mocks.consumeFacebookOAuthState.mockResolvedValue({
      supabaseUserId,
      workspaceId,
    });

    mocks.exchangeFacebookAuthorizationCode.mockResolvedValue({
      access_token: shortLivedToken,
    });

    mocks.exchangeFacebookLongLivedToken.mockResolvedValue({
      access_token: longLivedToken,
    });

    mocks.getFacebookUserIdentity.mockResolvedValue({
      facebookUserId,
    });

    mocks.discoverFacebookPages.mockResolvedValue(pages);

    mocks.createFacebookOAuthSession.mockResolvedValue({
      sessionToken: "temporary-session-token",
      expiresAt,
      pages: [
        {
          facebookPageId: "facebook-page-123",
          pageName: "Storm Test Page",
          tasks: ["CREATE_CONTENT", "MODERATE"],
        },
      ],
    });
  });

  it("completes the Facebook OAuth callback successfully", async () => {
    const result = await completeFacebookOAuthCallback({
      code,
      state,
    });

    expect(result).toEqual({
      workspaceId,
      sessionToken: "temporary-session-token",
      expiresAt,
      pages: [
        {
          facebookPageId: "facebook-page-123",
          pageName: "Storm Test Page",
          tasks: ["CREATE_CONTENT", "MODERATE"],
        },
      ],
    });
  });

  it("consumes the OAuth state with the original state value", async () => {
    await completeFacebookOAuthCallback({ code, state });

    expect(mocks.consumeFacebookOAuthState).toHaveBeenCalledWith({
      state,
    });

    expect(mocks.consumeFacebookOAuthState).toHaveBeenCalledTimes(1);
  });

  it("exchanges the authorization code", async () => {
    await completeFacebookOAuthCallback({ code, state });

    expect(mocks.exchangeFacebookAuthorizationCode).toHaveBeenCalledWith(code);
  });

  it("uses the short-lived token to request a long-lived token", async () => {
    await completeFacebookOAuthCallback({ code, state });

    expect(mocks.exchangeFacebookLongLivedToken).toHaveBeenCalledWith(
      shortLivedToken,
    );
  });

  it("uses the long-lived token to retrieve the Facebook user ID", async () => {
    await completeFacebookOAuthCallback({ code, state });

    expect(mocks.getFacebookUserIdentity).toHaveBeenCalledWith(longLivedToken);
  });

  it("uses the long-lived token to discover Facebook Pages", async () => {
    await completeFacebookOAuthCallback({ code, state });

    expect(mocks.discoverFacebookPages).toHaveBeenCalledWith(longLivedToken);
  });

  it("creates a session bound to the original user and workspace", async () => {
    await completeFacebookOAuthCallback({ code, state });

    expect(mocks.createFacebookOAuthSession).toHaveBeenCalledWith({
      supabaseUserId,
      workspaceId,
      facebookUserId,
      pages,
    });
  });

  it("executes the OAuth operations in the correct order", async () => {
    await completeFacebookOAuthCallback({ code, state });

    const operations = [
      mocks.consumeFacebookOAuthState,
      mocks.exchangeFacebookAuthorizationCode,
      mocks.exchangeFacebookLongLivedToken,
      mocks.getFacebookUserIdentity,
      mocks.discoverFacebookPages,
      mocks.createFacebookOAuthSession,
    ];

    const callOrders = operations.map(
      (operation) => operation.mock.invocationCallOrder[0],
    );

    expect(callOrders.every((order) => order !== undefined)).toBe(true);

    expect(callOrders).toEqual([...callOrders].sort((a, b) => a - b));
  });

  it("does not expose Facebook credentials in the result", async () => {
    const result = await completeFacebookOAuthCallback({
      code,
      state,
    });

    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain(code);
    expect(serialized).not.toContain(shortLivedToken);
    expect(serialized).not.toContain(longLivedToken);
    expect(serialized).not.toContain(pageAccessToken);
  });

  it("rejects missing authorization codes before consuming state", async () => {
    await expect(
      completeFacebookOAuthCallback({
        code: "",
        state,
      }),
    ).rejects.toMatchObject({
      name: "FacebookCallbackError",
      statusCode: 400,
    });

    expect(mocks.consumeFacebookOAuthState).not.toHaveBeenCalled();
  });

  it("rejects missing OAuth states before consuming state", async () => {
    await expect(
      completeFacebookOAuthCallback({
        code,
        state: "",
      }),
    ).rejects.toBeInstanceOf(FacebookCallbackError);

    expect(mocks.consumeFacebookOAuthState).not.toHaveBeenCalled();
  });

  it("stops immediately if the OAuth state is invalid", async () => {
    mocks.consumeFacebookOAuthState.mockRejectedValue(
      new Error("Invalid state"),
    );

    await expect(
      completeFacebookOAuthCallback({ code, state }),
    ).rejects.toMatchObject({
      name: "FacebookCallbackError",
      statusCode: 500,
    });

    expect(mocks.exchangeFacebookAuthorizationCode).not.toHaveBeenCalled();

    expect(mocks.createFacebookOAuthSession).not.toHaveBeenCalled();
  });

  it("stops if authorization code exchange fails", async () => {
    mocks.exchangeFacebookAuthorizationCode.mockRejectedValue(
      new Error("Token exchange failed"),
    );

    await expect(
      completeFacebookOAuthCallback({ code, state }),
    ).rejects.toBeInstanceOf(FacebookCallbackError);

    expect(mocks.exchangeFacebookLongLivedToken).not.toHaveBeenCalled();

    expect(mocks.createFacebookOAuthSession).not.toHaveBeenCalled();
  });

  it("stops if long-lived token exchange fails", async () => {
    mocks.exchangeFacebookLongLivedToken.mockRejectedValue(
      new Error("Long-lived token exchange failed"),
    );

    await expect(
      completeFacebookOAuthCallback({ code, state }),
    ).rejects.toBeInstanceOf(FacebookCallbackError);

    expect(mocks.getFacebookUserIdentity).not.toHaveBeenCalled();

    expect(mocks.createFacebookOAuthSession).not.toHaveBeenCalled();
  });

  it("stops if Facebook user identity retrieval fails", async () => {
    mocks.getFacebookUserIdentity.mockRejectedValue(
      new Error("Identity retrieval failed"),
    );

    await expect(
      completeFacebookOAuthCallback({ code, state }),
    ).rejects.toBeInstanceOf(FacebookCallbackError);

    expect(mocks.discoverFacebookPages).not.toHaveBeenCalled();

    expect(mocks.createFacebookOAuthSession).not.toHaveBeenCalled();
  });

  it("stops if Facebook Page discovery fails", async () => {
    mocks.discoverFacebookPages.mockRejectedValue(
      new Error("Page discovery failed"),
    );

    await expect(
      completeFacebookOAuthCallback({ code, state }),
    ).rejects.toBeInstanceOf(FacebookCallbackError);

    expect(mocks.createFacebookOAuthSession).not.toHaveBeenCalled();
  });

  it("normalizes temporary session creation failures", async () => {
    mocks.createFacebookOAuthSession.mockRejectedValue(
      new Error(`Sensitive token: ${pageAccessToken}`),
    );

    let caughtError: unknown;

    try {
      await completeFacebookOAuthCallback({ code, state });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(FacebookCallbackError);

    const message = (caughtError as Error).message;

    expect(message).not.toContain(pageAccessToken);
    expect(message).toBe("Facebook authorization could not be completed.");
  });

  it("does not create permanent Facebook Page connections", async () => {
    await completeFacebookOAuthCallback({ code, state });

    expect(mocks.createFacebookOAuthSession).toHaveBeenCalledTimes(1);

    // The callback only creates a temporary selection session.
    // Permanent Page connections are handled by a separate service.
  });
});
