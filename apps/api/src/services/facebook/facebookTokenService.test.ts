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
  exchangeFacebookAuthorizationCode,
  FacebookTokenExchangeError,
} from "./facebookTokenService.js";

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

describe("Facebook token exchange service", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockEnv.FACEBOOK_GRAPH_API_VERSION = "v25.0";

    getFacebookOAuthConfigMock.mockReturnValue(MOCK_CONFIG);
  });

  it("rejects an empty authorization code", async () => {
    const fetchMock = vi.fn();

    await expect(
      exchangeFacebookAuthorizationCode(
        " ",
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({
      name: "FacebookTokenExchangeError",
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
      exchangeFacebookAuthorizationCode(
        "valid-code",
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
      exchangeFacebookAuthorizationCode(
        "valid-code",
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({
      statusCode: 503,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exchanges an authorization code for a user access token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createMockResponse({
        access_token: "facebook-user-access-token",
        token_type: "bearer",
        expires_in: 3600,
      }),
    );

    const result = await exchangeFacebookAuthorizationCode(
      "valid-authorization-code",
      fetchMock as unknown as typeof fetch,
    );

    expect(result).toEqual({
      access_token: "facebook-user-access-token",
      token_type: "bearer",
      expires_in: 3600,
    });

    expect(fetchMock).toHaveBeenCalledOnce();

    const [requestUrl, requestOptions] = fetchMock.mock.calls[0] as [
      URL,
      RequestInit,
    ];

    const url = new URL(requestUrl);

    expect(url.origin).toBe("https://graph.facebook.com");

    expect(url.pathname).toBe("/v25.0/oauth/access_token");

    expect(url.searchParams.get("client_id")).toBe(MOCK_CONFIG.appId);

    expect(url.searchParams.get("client_secret")).toBe(MOCK_CONFIG.appSecret);

    expect(url.searchParams.get("redirect_uri")).toBe(MOCK_CONFIG.redirectUri);

    expect(url.searchParams.get("code")).toBe("valid-authorization-code");

    expect(requestOptions.method).toBe("GET");

    expect(requestOptions.headers).toEqual({
      Accept: "application/json",
    });
  });

  it("accepts a valid token response without optional fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createMockResponse({
        access_token: "facebook-user-access-token",
      }),
    );

    const result = await exchangeFacebookAuthorizationCode(
      "valid-code",
      fetchMock as unknown as typeof fetch,
    );

    expect(result.access_token).toBe("facebook-user-access-token");

    expect(result.expires_in).toBeUndefined();
  });

  it("rejects Facebook API errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createMockResponse(
        {
          error: {
            message: "Invalid authorization code",
            type: "OAuthException",
            code: 100,
          },
        },
        400,
      ),
    );

    await expect(
      exchangeFacebookAuthorizationCode(
        "invalid-code",
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({
      name: "FacebookTokenExchangeError",
      statusCode: 502,
    });
  });

  it("handles network failures", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new Error("Network unavailable"));

    await expect(
      exchangeFacebookAuthorizationCode(
        "valid-code",
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
      exchangeFacebookAuthorizationCode(
        "valid-code",
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({
      statusCode: 502,
      message: "Facebook returned an invalid token response.",
    });
  });

  it("rejects responses without an access token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createMockResponse({
        token_type: "bearer",
        expires_in: 3600,
      }),
    );

    await expect(
      exchangeFacebookAuthorizationCode(
        "valid-code",
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({
      statusCode: 502,
    });
  });

  it("rejects invalid token expiration values", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createMockResponse({
        access_token: "facebook-user-access-token",
        expires_in: -100,
      }),
    );

    await expect(
      exchangeFacebookAuthorizationCode(
        "valid-code",
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(FacebookTokenExchangeError);
  });

  it("uses the configured Graph API version", async () => {
    mockEnv.FACEBOOK_GRAPH_API_VERSION = "v24.0";

    const fetchMock = vi.fn().mockResolvedValue(
      createMockResponse({
        access_token: "facebook-user-access-token",
      }),
    );

    await exchangeFacebookAuthorizationCode(
      "valid-code",
      fetchMock as unknown as typeof fetch,
    );

    const [requestUrl] = fetchMock.mock.calls[0] as [URL];

    expect(new URL(requestUrl).pathname).toBe("/v24.0/oauth/access_token");
  });
});
