import { beforeEach, describe, expect, it, vi } from "vitest";

import { env } from "../../config/env.js";

import {
  FacebookUserIdentityError,
  getFacebookUserIdentity,
} from "./facebookUserIdentityService.js";

// Ensure these tests do not depend on local Facebook configuration.
// No real Facebook API requests are made.
const TEST_GRAPH_API_VERSION = "v24.0";

beforeEach(() => {
  vi.stubEnv("FACEBOOK_GRAPH_API_VERSION", TEST_GRAPH_API_VERSION);
});

describe("Facebook User Identity Service", () => {
  const userAccessToken = "test-facebook-user-access-token";

  beforeEach(() => {
    vi.restoreAllMocks();

    env.FACEBOOK_GRAPH_API_VERSION = "v24.0";
  });

  it("retrieves the Facebook user ID successfully", async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "123456789012345",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    const result = await getFacebookUserIdentity(userAccessToken, mockFetch);

    expect(result).toEqual({
      facebookUserId: "123456789012345",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("uses the configured Facebook Graph API version", async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ id: "123456789" }), {
        status: 200,
      }),
    );

    await getFacebookUserIdentity(userAccessToken, mockFetch);

    const requestUrl = mockFetch.mock.calls[0]?.[0];

    expect(requestUrl).toBeInstanceOf(URL);

    const url = requestUrl as URL;

    expect(url.origin).toBe("https://graph.facebook.com");

    expect(url.pathname).toBe(`/${env.FACEBOOK_GRAPH_API_VERSION}/me`);

    expect(url.searchParams.get("fields")).toBe("id");
  });

  it("sends the access token in the Authorization header", async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ id: "123456789" }), {
        status: 200,
      }),
    );

    await getFacebookUserIdentity(userAccessToken, mockFetch);

    const requestOptions = mockFetch.mock.calls[0]?.[1];

    expect(requestOptions).toMatchObject({
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${userAccessToken}`,
      },
    });
  });

  it("does not place the access token in the URL", async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ id: "123456789" }), {
        status: 200,
      }),
    );

    await getFacebookUserIdentity(userAccessToken, mockFetch);

    const requestUrl = mockFetch.mock.calls[0]?.[0];

    expect(String(requestUrl)).not.toContain(userAccessToken);
  });

  it("rejects an empty access token", async () => {
    const mockFetch = vi.fn<typeof fetch>();

    await expect(getFacebookUserIdentity("", mockFetch)).rejects.toMatchObject({
      name: "FacebookUserIdentityError",
      statusCode: 400,
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects a whitespace-only access token", async () => {
    const mockFetch = vi.fn<typeof fetch>();

    await expect(
      getFacebookUserIdentity("   ", mockFetch),
    ).rejects.toBeInstanceOf(FacebookUserIdentityError);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("handles Facebook API rejection", async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: "Sensitive provider error",
          },
        }),
        {
          status: 401,
        },
      ),
    );

    await expect(
      getFacebookUserIdentity(userAccessToken, mockFetch),
    ).rejects.toMatchObject({
      name: "FacebookUserIdentityError",
      statusCode: 502,
      message: "Facebook rejected the identity request.",
    });
  });

  it("handles network failures", async () => {
    const mockFetch = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("Network connection failed"));

    await expect(
      getFacebookUserIdentity(userAccessToken, mockFetch),
    ).rejects.toMatchObject({
      name: "FacebookUserIdentityError",
      statusCode: 502,
      message: "Unable to contact Facebook's identity service.",
    });
  });

  it("rejects invalid JSON responses", async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("not-valid-json", {
        status: 200,
      }),
    );

    await expect(
      getFacebookUserIdentity(userAccessToken, mockFetch),
    ).rejects.toMatchObject({
      name: "FacebookUserIdentityError",
      statusCode: 502,
    });
  });

  it("rejects responses missing the Facebook user ID", async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ name: "Test User" }), {
        status: 200,
      }),
    );

    await expect(
      getFacebookUserIdentity(userAccessToken, mockFetch),
    ).rejects.toMatchObject({
      name: "FacebookUserIdentityError",
      statusCode: 502,
    });
  });

  it("rejects an empty Facebook user ID", async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ id: "" }), {
        status: 200,
      }),
    );

    await expect(
      getFacebookUserIdentity(userAccessToken, mockFetch),
    ).rejects.toMatchObject({
      name: "FacebookUserIdentityError",
      statusCode: 502,
    });
  });

  it("does not expose tokens or provider errors", async () => {
    const sensitiveToken = "super-secret-facebook-token";

    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: `Rejected token: ${sensitiveToken}`,
          },
        }),
        {
          status: 403,
        },
      ),
    );

    let caughtError: unknown;

    try {
      await getFacebookUserIdentity(sensitiveToken, mockFetch);
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(FacebookUserIdentityError);

    const message = (caughtError as Error).message;

    expect(message).not.toContain(sensitiveToken);
    expect(message).not.toContain("Rejected token:");
  });
});
