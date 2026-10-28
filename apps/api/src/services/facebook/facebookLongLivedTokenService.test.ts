import { beforeEach, describe, expect, it, vi } from "vitest";

const { getFacebookOAuthConfigMock, mockEnv } = vi.hoisted(() => ({
  getFacebookOAuthConfigMock: vi.fn(),

  mockEnv: {
    FACEBOOK_GRAPH_API_VERSION: "v25.0" as string | undefined,
  },
}));

vi.mock("./facebookConfig.js", () => ({
  getFacebookOAuthConfig: getFacebookOAuthConfigMock,

  FacebookConfigurationError: class FacebookConfigurationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "FacebookConfigurationError";
    }
  },
}));

vi.mock("../../config/env.js", () => ({
  env: mockEnv,
}));

import {
  exchangeFacebookLongLivedToken,
  FacebookLongLivedTokenError,
} from "./facebookLongLivedTokenService.js";

import { FacebookConfigurationError } from "./facebookConfig.js";

const MOCK_CONFIG = {
  appId: "test-facebook-app-id",
  appSecret: "test-facebook-app-secret",
  redirectUri: "http://localhost:4000/api/facebook/callback",
};

function createMockResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

describe("Facebook long-lived token service", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockEnv.FACEBOOK_GRAPH_API_VERSION = "v25.0";

    getFacebookOAuthConfigMock.mockReturnValue(MOCK_CONFIG);
  });

  it("rejects an empty user access token", async () => {
    const fetchMock = vi.fn();

    await expect(
      exchangeFacebookLongLivedToken(" ", fetchMock as unknown as typeof fetch),
    ).rejects.toMatchObject({
      name: "FacebookLongLivedTokenError",
      statusCode: 400,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects missing Facebook configuration", async () => {
    getFacebookOAuthConfigMock.mockImplementation(() => {
      throw new FacebookConfigurationError(
        "Facebook OAuth is not configured on the server.",
      );
    });

    const fetchMock = vi.fn();

    await expect(
      exchangeFacebookLongLivedToken(
        "short-lived-token",
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({
      statusCode: 503,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a missing Graph API version", async () => {
    mockEnv.FACEBOOK_GRAPH_API_VERSION = undefined;

    const fetchMock = vi.fn();

    await expect(
      exchangeFacebookLongLivedToken(
        "short-lived-token",
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({
      statusCode: 503,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exchanges a short-lived token for a long-lived token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createMockResponse({
        access_token: "long-lived-facebook-token",
        token_type: "bearer",
        expires_in: 5184000,
      }),
    );

    const result = await exchangeFacebookLongLivedToken(
      "short-lived-facebook-token",
      fetchMock as unknown as typeof fetch,
    );

    expect(result).toEqual({
      access_token: "long-lived-facebook-token",
      token_type: "bearer",
      expires_in: 5184000,
    });

    expect(fetchMock).toHaveBeenCalledOnce();

    const [requestUrl, requestOptions] = fetchMock.mock.calls[0] as [
      URL,
      RequestInit,
    ];

    const url = new URL(requestUrl);

    expect(url.origin).toBe("https://graph.facebook.com");

    expect(url.pathname).toBe("/v25.0/oauth/access_token");

    expect(url.searchParams.get("grant_type")).toBe("fb_exchange_token");

    expect(url.searchParams.get("client_id")).toBe(MOCK_CONFIG.appId);

    expect(url.searchParams.get("client_secret")).toBe(MOCK_CONFIG.appSecret);

    expect(url.searchParams.get("fb_exchange_token")).toBe(
      "short-lived-facebook-token",
    );

    expect(requestOptions.method).toBe("GET");

    expect(requestOptions.headers).toEqual({
      Accept: "application/json",
    });
  });

  it("accepts a valid response without optional fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createMockResponse({
        access_token: "long-lived-facebook-token",
      }),
    );

    const result = await exchangeFacebookLongLivedToken(
      "short-lived-token",
      fetchMock as unknown as typeof fetch,
    );

    expect(result.access_token).toBe("long-lived-facebook-token");

    expect(result.expires_in).toBeUndefined();
  });

  it("rejects Facebook API errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createMockResponse(
        {
          error: {
            message: "Invalid OAuth access token",
            type: "OAuthException",
            code: 190,
          },
        },
        400,
      ),
    );

    await expect(
      exchangeFacebookLongLivedToken(
        "invalid-token",
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({
      name: "FacebookLongLivedTokenError",
      statusCode: 502,
      message: "Facebook rejected the user token exchange.",
    });
  });

  it("handles network failures", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new Error("Network unavailable"));

    await expect(
      exchangeFacebookLongLivedToken(
        "short-lived-token",
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({
      statusCode: 502,
      message: "Unable to contact Facebook's token service.",
    });
  });

  it("rejects invalid JSON responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("not-valid-json", {
        status: 200,
      }),
    );

    await expect(
      exchangeFacebookLongLivedToken(
        "short-lived-token",
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({
      statusCode: 502,
      message: "Facebook returned an invalid long-lived token response.",
    });
  });

  it("rejects responses without an access token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createMockResponse({
        token_type: "bearer",
        expires_in: 5184000,
      }),
    );

    await expect(
      exchangeFacebookLongLivedToken(
        "short-lived-token",
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({
      statusCode: 502,
    });
  });

  it("rejects invalid expiration values", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createMockResponse({
        access_token: "long-lived-facebook-token",
        expires_in: -100,
      }),
    );

    await expect(
      exchangeFacebookLongLivedToken(
        "short-lived-token",
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(FacebookLongLivedTokenError);
  });

  it("uses the configured Graph API version", async () => {
    mockEnv.FACEBOOK_GRAPH_API_VERSION = "v24.0";

    const fetchMock = vi.fn().mockResolvedValue(
      createMockResponse({
        access_token: "long-lived-facebook-token",
      }),
    );

    await exchangeFacebookLongLivedToken(
      "short-lived-token",
      fetchMock as unknown as typeof fetch,
    );

    const [requestUrl] = fetchMock.mock.calls[0] as [URL];

    expect(new URL(requestUrl).pathname).toBe("/v24.0/oauth/access_token");
  });

  it("preserves unexpected configuration errors", async () => {
    getFacebookOAuthConfigMock.mockImplementation(() => {
      throw new Error("Unexpected configuration failure");
    });

    await expect(
      exchangeFacebookLongLivedToken(
        "short-lived-token",
        vi.fn() as unknown as typeof fetch,
      ),
    ).rejects.toThrow("Unexpected configuration failure");
  });
});
