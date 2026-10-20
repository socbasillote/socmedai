import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getConfigMock } = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
}));

vi.mock("./linkedinConfig.js", () => ({
  getLinkedInOAuthConfig: getConfigMock,
}));

import {
  exchangeLinkedInAuthorizationCode,
  LinkedInTokenExchangeError,
} from "./linkedinTokenService.js";

describe("LinkedIn token service", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.clearAllMocks();

    getConfigMock.mockReturnValue({
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      redirectUri: "http://localhost:4000/api/linkedin/callback",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exchanges a code and validates the token response", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "test-access-token",
          expires_in: 5184000,
          scope: "openid profile w_member_social",
        }),
        { status: 200 },
      ),
    );

    const result = await exchangeLinkedInAuthorizationCode(
      "test-code",
      fetchMock,
    );

    expect(result.access_token).toBe("test-access-token");
    expect(result.expires_in).toBe(5184000);

    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://www.linkedin.com/oauth/v2/accessToken");
    expect(options?.method).toBe("POST");

    const body = options?.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("test-code");
    expect(body.get("client_id")).toBe("test-client-id");
    expect(body.get("client_secret")).toBe("test-client-secret");
    expect(body.get("redirect_uri")).toBe(
      "http://localhost:4000/api/linkedin/callback",
    );

    expect(url).not.toContain("test-client-secret");
  });

  it("rejects an empty authorization code", async () => {
    await expect(
      exchangeLinkedInAuthorizationCode("  ", fetchMock),
    ).rejects.toMatchObject({
      name: "LinkedInTokenExchangeError",
      statusCode: 400,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 503 when LinkedIn configuration is missing", async () => {
    getConfigMock.mockImplementation(() => {
      throw new Error("Missing configuration");
    });

    await expect(
      exchangeLinkedInAuthorizationCode("test-code", fetchMock),
    ).rejects.toMatchObject({
      name: "LinkedInTokenExchangeError",
      statusCode: 503,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("handles a LinkedIn rejection without exposing provider details", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error_description: "Sensitive provider details" }),
        { status: 400 },
      ),
    );

    await expect(
      exchangeLinkedInAuthorizationCode("invalid-code", fetchMock),
    ).rejects.toMatchObject({
      name: "LinkedInTokenExchangeError",
      statusCode: 502,
      message: "LinkedIn rejected the authorization code.",
    });
  });

  it("handles network errors", async () => {
    fetchMock.mockRejectedValue(new Error("Network failure"));

    await expect(
      exchangeLinkedInAuthorizationCode("test-code", fetchMock),
    ).rejects.toMatchObject({
      name: "LinkedInTokenExchangeError",
      statusCode: 502,
      message: "Unable to contact LinkedIn's token service.",
    });
  });

  it("rejects malformed token responses", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ access_token: "token-without-expiry" }), {
        status: 200,
      }),
    );

    await expect(
      exchangeLinkedInAuthorizationCode("test-code", fetchMock),
    ).rejects.toMatchObject({
      name: "LinkedInTokenExchangeError",
      statusCode: 502,
      message: "LinkedIn returned an invalid token response.",
    });
  });

  it("handles invalid JSON from LinkedIn", async () => {
    fetchMock.mockResolvedValue(new Response("not-json", { status: 200 }));

    await expect(
      exchangeLinkedInAuthorizationCode("test-code", fetchMock),
    ).rejects.toMatchObject({
      name: "LinkedInTokenExchangeError",
      statusCode: 502,
      message: "LinkedIn returned an invalid token response.",
    });
  });
});
