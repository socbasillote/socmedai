import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    FACEBOOK_GRAPH_API_VERSION: "v25.0" as string | undefined,
  },
}));

vi.mock("../../config/env.js", () => ({
  env: mockEnv,
}));

import {
  discoverFacebookPages,
  FacebookPageDiscoveryError,
} from "./facebookPageDiscoveryService.js";

const USER_TOKEN = "test-facebook-user-token";

function createMockResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function createPage(
  id: string,
  name: string,
  tasks: string[] = ["CREATE_CONTENT", "MANAGE"],
) {
  return {
    id,
    name,
    access_token: `page-token-${id}`,
    tasks,
  };
}

describe("Facebook Page discovery service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockEnv.FACEBOOK_GRAPH_API_VERSION = "v25.0";
  });

  it("rejects an empty user access token", async () => {
    const fetchMock = vi.fn();

    await expect(
      discoverFacebookPages(" ", fetchMock as unknown as typeof fetch),
    ).rejects.toMatchObject({
      name: "FacebookPageDiscoveryError",
      statusCode: 400,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a missing Graph API version", async () => {
    mockEnv.FACEBOOK_GRAPH_API_VERSION = undefined;

    const fetchMock = vi.fn();

    await expect(
      discoverFacebookPages(USER_TOKEN, fetchMock as unknown as typeof fetch),
    ).rejects.toMatchObject({
      statusCode: 503,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("discovers Facebook Pages successfully", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createMockResponse({
        data: [
          createPage("page-1", "Storm Business Page"),
          createPage("page-2", "Storm Community Page"),
        ],
      }),
    );

    const pages = await discoverFacebookPages(
      USER_TOKEN,
      fetchMock as unknown as typeof fetch,
    );

    expect(pages).toEqual([
      {
        facebookPageId: "page-1",
        pageName: "Storm Business Page",
        pageAccessToken: "page-token-page-1",
        tasks: ["CREATE_CONTENT", "MANAGE"],
      },
      {
        facebookPageId: "page-2",
        pageName: "Storm Community Page",
        pageAccessToken: "page-token-page-2",
        tasks: ["CREATE_CONTENT", "MANAGE"],
      },
    ]);

    expect(fetchMock).toHaveBeenCalledOnce();

    const [requestUrl, requestOptions] = fetchMock.mock.calls[0] as [
      URL,
      RequestInit,
    ];

    const url = new URL(requestUrl);

    expect(url.origin).toBe("https://graph.facebook.com");
    expect(url.pathname).toBe("/v25.0/me/accounts");

    expect(url.searchParams.get("fields")).toBe("id,name,access_token,tasks");

    expect(url.searchParams.get("limit")).toBe("100");

    expect(requestOptions.method).toBe("GET");

    expect(requestOptions.headers).toEqual({
      Accept: "application/json",
      Authorization: `Bearer ${USER_TOKEN}`,
    });
  });

  it("returns an empty array when no Pages are available", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createMockResponse({
        data: [],
      }),
    );

    const pages = await discoverFacebookPages(
      USER_TOKEN,
      fetchMock as unknown as typeof fetch,
    );

    expect(pages).toEqual([]);
  });

  it("handles multiple pages of API results", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createMockResponse({
          data: [createPage("page-1", "First Page")],
          paging: {
            cursors: {
              after: "cursor-1",
            },
            next: "https://graph.facebook.com/next-page",
          },
        }),
      )
      .mockResolvedValueOnce(
        createMockResponse({
          data: [createPage("page-2", "Second Page")],
        }),
      );

    const pages = await discoverFacebookPages(
      USER_TOKEN,
      fetchMock as unknown as typeof fetch,
    );

    expect(pages).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [secondRequestUrl] = fetchMock.mock.calls[1] as [URL];

    const secondUrl = new URL(secondRequestUrl);

    expect(secondUrl.searchParams.get("after")).toBe("cursor-1");
  });

  it("deduplicates Pages across API responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createMockResponse({
          data: [createPage("page-1", "First Page")],
          paging: {
            cursors: {
              after: "cursor-1",
            },
            next: "https://graph.facebook.com/next-page",
          },
        }),
      )
      .mockResolvedValueOnce(
        createMockResponse({
          data: [
            createPage("page-1", "Duplicate Page"),
            createPage("page-2", "Second Page"),
          ],
        }),
      );

    const pages = await discoverFacebookPages(
      USER_TOKEN,
      fetchMock as unknown as typeof fetch,
    );

    expect(pages).toHaveLength(2);

    expect(pages.map((page) => page.facebookPageId)).toEqual([
      "page-1",
      "page-2",
    ]);

    expect(pages[0]?.pageName).toBe("First Page");
  });

  it("rejects pagination without an after cursor", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createMockResponse({
        data: [createPage("page-1", "First Page")],
        paging: {
          next: "https://graph.facebook.com/next-page",
        },
      }),
    );

    await expect(
      discoverFacebookPages(USER_TOKEN, fetchMock as unknown as typeof fetch),
    ).rejects.toMatchObject({
      statusCode: 502,
      message: "Facebook returned invalid Page pagination.",
    });
  });

  it("rejects circular pagination", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createMockResponse({
          data: [createPage("page-1", "First Page")],
          paging: {
            cursors: {
              after: "repeated-cursor",
            },
            next: "https://graph.facebook.com/v25.0/me/accounts?after=repeated-cursor",
          },
        }),
      )
      .mockResolvedValueOnce(
        createMockResponse({
          data: [createPage("page-2", "Second Page")],
          paging: {
            cursors: {
              after: "repeated-cursor",
            },
            next: "https://graph.facebook.com/v25.0/me/accounts?after=repeated-cursor",
          },
        }),
      );

    await expect(
      discoverFacebookPages(USER_TOKEN, fetchMock as unknown as typeof fetch),
    ).rejects.toMatchObject({
      name: "FacebookPageDiscoveryError",
      statusCode: 502,
      message: "Facebook returned invalid Page pagination.",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
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
      discoverFacebookPages(USER_TOKEN, fetchMock as unknown as typeof fetch),
    ).rejects.toMatchObject({
      statusCode: 502,
      message: "Facebook rejected the Page discovery request.",
    });
  });

  it("handles network failures", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new Error("Network unavailable"));

    await expect(
      discoverFacebookPages(USER_TOKEN, fetchMock as unknown as typeof fetch),
    ).rejects.toMatchObject({
      statusCode: 502,
      message: "Unable to contact Facebook's Page service.",
    });
  });

  it("rejects invalid JSON responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("not-valid-json", {
        status: 200,
      }),
    );

    await expect(
      discoverFacebookPages(USER_TOKEN, fetchMock as unknown as typeof fetch),
    ).rejects.toMatchObject({
      statusCode: 502,
      message: "Facebook returned an invalid Page discovery response.",
    });
  });

  it("rejects Pages missing required fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createMockResponse({
        data: [
          {
            id: "page-1",
            name: "Incomplete Page",
          },
        ],
      }),
    );

    await expect(
      discoverFacebookPages(USER_TOKEN, fetchMock as unknown as typeof fetch),
    ).rejects.toBeInstanceOf(FacebookPageDiscoveryError);
  });

  it("defaults missing Page tasks to an empty array", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createMockResponse({
        data: [
          {
            id: "page-1",
            name: "Page Without Tasks",
            access_token: "page-token-1",
          },
        ],
      }),
    );

    const pages = await discoverFacebookPages(
      USER_TOKEN,
      fetchMock as unknown as typeof fetch,
    );

    expect(pages[0]?.tasks).toEqual([]);
  });

  it("rejects discovery beyond the pagination limit", async () => {
    let cursorNumber = 0;

    const fetchMock = vi.fn().mockImplementation(() => {
      cursorNumber += 1;

      return Promise.resolve(
        createMockResponse({
          data: [createPage(`page-${cursorNumber}`, `Page ${cursorNumber}`)],
          paging: {
            cursors: {
              after: `cursor-${cursorNumber}`,
            },
            next: "https://graph.facebook.com/next-page",
          },
        }),
      );
    });

    await expect(
      discoverFacebookPages(USER_TOKEN, fetchMock as unknown as typeof fetch),
    ).rejects.toMatchObject({
      statusCode: 502,
      message: "Facebook Page discovery exceeded the pagination limit.",
    });

    expect(fetchMock).toHaveBeenCalledTimes(100);
  });

  it("uses the configured Graph API version", async () => {
    mockEnv.FACEBOOK_GRAPH_API_VERSION = "v24.0";

    const fetchMock = vi.fn().mockResolvedValue(
      createMockResponse({
        data: [],
      }),
    );

    await discoverFacebookPages(
      USER_TOKEN,
      fetchMock as unknown as typeof fetch,
    );

    const [requestUrl] = fetchMock.mock.calls[0] as [URL];

    expect(new URL(requestUrl).pathname).toBe("/v24.0/me/accounts");
  });
});
