import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  publishFacebookTextPost,
  type FacebookTextPostInput,
} from "./facebookPostService.js";

import { FACEBOOK_POST_MESSAGE_MAX_LENGTH } from "./facebookPublishInput.js";

/**
 * Use a fixed Graph API version for tests.
 *
 * No real Facebook configuration or credentials
 * are required.
 */
vi.mock("../../config/env.js", () => ({
  env: {
    FACEBOOK_GRAPH_API_VERSION: "v24.0",
  },
}));

const PAGE_ID = "123456789";

const VALID_INPUT: FacebookTextPostInput = {
  pageId: PAGE_ID,
  pageAccessToken: "test-page-access-token",
  message: "Hello from Storm!",
};

const ENDPOINT = `https://graph.facebook.com/v24.0/${PAGE_ID}/feed`;

/**
 * Construct a mocked HTTP response.
 */
function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

/**
 * Create a mocked fetch implementation.
 *
 * This prevents all real network requests.
 */
function createFetchMock(response: Response) {
  return vi.fn(
    async (..._args: Parameters<typeof fetch>): Promise<Response> => response,
  );
}
describe("publishFacebookTextPost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Test 1:
   * Verify successful Facebook publishing.
   */
  it("returns published when Facebook confirms the post", async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        id: "123456789_987654321",
      }),
    );

    const result = await publishFacebookTextPost(
      VALID_INPUT,
      fetchMock as unknown as typeof fetch,
    );

    expect(result).toEqual({
      outcome: "published",
      externalPostId: "123456789_987654321",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  /**
   * Test 2:
   * Verify the Graph API request structure.
   */
  it("sends the correct Facebook Graph API request", async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        id: "123456789_987654321",
      }),
    );

    await publishFacebookTextPost(
      VALID_INPUT,
      fetchMock as unknown as typeof fetch,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      ENDPOINT,
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        headers: {
          Authorization: "Bearer test-page-access-token",
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: "message=Hello+from+Storm%21",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  /**
   * Test 3:
   * Trim text before sending to Facebook.
   */
  it("trims post content before publishing", async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        id: "123456789_987654321",
      }),
    );

    await publishFacebookTextPost(
      {
        ...VALID_INPUT,
        message: "   Hello from Storm!   ",
      },
      fetchMock as unknown as typeof fetch,
    );

    const options = fetchMock.mock.calls[0]?.[1];

    expect(options?.body).toBe("message=Hello+from+Storm%21");
  });

  /**
   * Test 4:
   * Reject invalid Facebook Page IDs.
   */
  it("rejects invalid Facebook Page IDs", async () => {
    const fetchMock = vi.fn();

    const result = await publishFacebookTextPost(
      {
        ...VALID_INPUT,
        pageId: "invalid-page",
      },
      fetchMock as unknown as typeof fetch,
    );

    expect(result).toEqual({
      outcome: "failed",
      message: "A valid Facebook Page ID is required.",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  /**
   * Test 5:
   * Reject missing Page credentials.
   */
  it("rejects missing Facebook Page credentials", async () => {
    const fetchMock = vi.fn();

    const result = await publishFacebookTextPost(
      {
        ...VALID_INPUT,
        pageAccessToken: "  ",
      },
      fetchMock as unknown as typeof fetch,
    );

    expect(result).toEqual({
      outcome: "failed",
      message: "Facebook Page credentials are unavailable.",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  /**
   * Test 6:
   * Reject whitespace-only content.
   */
  it("rejects empty Facebook post content", async () => {
    const fetchMock = vi.fn();

    const result = await publishFacebookTextPost(
      {
        ...VALID_INPUT,
        message: "   \n   ",
      },
      fetchMock as unknown as typeof fetch,
    );

    expect(result).toEqual({
      outcome: "failed",
      message: "Post content cannot be empty.",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  /**
   * Test 7:
   * Reject content exceeding Storm's length limit.
   */
  it("rejects oversized Facebook post content", async () => {
    const fetchMock = vi.fn();

    const result = await publishFacebookTextPost(
      {
        ...VALID_INPUT,
        message: "A".repeat(FACEBOOK_POST_MESSAGE_MAX_LENGTH + 1),
      },
      fetchMock as unknown as typeof fetch,
    );

    expect(result).toEqual({
      outcome: "failed",
      message: "Facebook post content exceeds Storm's limit.",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  /**
   * Test 8:
   * Accept content exactly at Storm's length limit.
   */
  it("accepts content at the maximum length", async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        id: "123456789_987654321",
      }),
    );

    const result = await publishFacebookTextPost(
      {
        ...VALID_INPUT,
        message: "A".repeat(FACEBOOK_POST_MESSAGE_MAX_LENGTH),
      },
      fetchMock as unknown as typeof fetch,
    );

    expect(result.outcome).toBe("published");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  /**
   * Test 9:
   * Network failures create uncertain outcomes.
   */
  it("returns unknown when the network request fails", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new Error("Network connection reset"));

    const result = await publishFacebookTextPost(
      VALID_INPUT,
      fetchMock as unknown as typeof fetch,
    );

    expect(result).toEqual({
      outcome: "unknown",
      message:
        "Facebook publishing could not be confirmed. " +
        "Check the Page before retrying.",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  /**
   * Test 10:
   * A successful HTTP response without a valid
   * Facebook post ID must not be marked published.
   */
  it("returns unknown when Facebook omits the post ID", async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        success: true,
      }),
    );

    const result = await publishFacebookTextPost(
      VALID_INPUT,
      fetchMock as unknown as typeof fetch,
    );

    expect(result.outcome).toBe("unknown");
  });

  /**
   * Test 11:
   * Handle invalid response JSON.
   */
  it("returns unknown for malformed Facebook JSON", async () => {
    const fetchMock = createFetchMock(
      new Response("{ invalid-json", {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    const result = await publishFacebookTextPost(
      VALID_INPUT,
      fetchMock as unknown as typeof fetch,
    );

    expect(result.outcome).toBe("unknown");
  });

  /**
   * Test 12:
   * Recognize definite Facebook API rejections.
   */
  it.each([400, 401, 403, 404, 422])(
    "returns failed when Facebook responds with HTTP %i",
    async (status) => {
      const fetchMock = createFetchMock(
        jsonResponse(
          {
            error: {
              message: "Facebook request rejected",
            },
          },
          status,
        ),
      );

      const result = await publishFacebookTextPost(
        VALID_INPUT,
        fetchMock as unknown as typeof fetch,
      );

      expect(result).toEqual({
        outcome: "failed",
        message:
          `Facebook rejected the publishing request ` + `(HTTP ${status}).`,
      });
    },
  );

  /**
   * Test 13:
   * Server errors must be treated conservatively.
   */
  it("returns unknown for Facebook server errors", async () => {
    const fetchMock = createFetchMock(
      jsonResponse(
        {
          error: "Internal server error",
        },
        500,
      ),
    );

    const result = await publishFacebookTextPost(
      VALID_INPUT,
      fetchMock as unknown as typeof fetch,
    );

    expect(result.outcome).toBe("unknown");
  });

  /**
   * Test 14:
   * Only HTTP 200 is accepted by the current
   * implementation as a confirmed success.
   */
  it("returns unknown for unexpected HTTP success statuses", async () => {
    const fetchMock = createFetchMock(
      jsonResponse(
        {
          id: "123456789_987654321",
        },
        201,
      ),
    );

    const result = await publishFacebookTextPost(
      VALID_INPUT,
      fetchMock as unknown as typeof fetch,
    );

    expect(result.outcome).toBe("unknown");
  });

  /**
   * Test 15:
   * Never leak Page credentials into errors.
   */
  it("does not expose Facebook access tokens in failures", async () => {
    const secretToken = "private-facebook-access-token-123";

    const fetchMock = vi
      .fn()
      .mockRejectedValue(
        new Error(`Network failed using token ${secretToken}`),
      );

    const result = await publishFacebookTextPost(
      {
        ...VALID_INPUT,
        pageAccessToken: secretToken,
      },
      fetchMock as unknown as typeof fetch,
    );

    expect(result.outcome).toBe("unknown");

    expect(JSON.stringify(result)).not.toContain(secretToken);
  });
});
