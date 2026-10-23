import { describe, expect, it, vi } from "vitest";
import { publishLinkedInTextPost } from "./linkedinPostService.js";

describe("publishLinkedInTextPost", () => {
  const validInput = {
    accessToken: "test-access-token",
    linkedinMemberId: "member-123",
    caption: "Hello LinkedIn! This is a test post.",
  };

  it("confirms publication when LinkedIn returns 201 with a post ID", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 201,
        headers: {
          "x-restli-id": "urn:li:share:123456",
        },
      }),
    );

    const result = await publishLinkedInTextPost(
      validInput,
      fetchMock as typeof fetch,
    );

    expect(result).toEqual({
      outcome: "published",
      externalPostId: "urn:li:share:123456",
    });

    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, options] = fetchMock.mock.calls[0];

    expect(url).toBe("https://api.linkedin.com/rest/posts");
    expect(options.method).toBe("POST");

    expect(options.headers.Authorization).toBe("Bearer test-access-token");

    expect(options.headers["Linkedin-Version"]).toBe("202610");

    const body = JSON.parse(options.body);

    expect(body).toMatchObject({
      author: "urn:li:person:member-123",
      commentary: validInput.caption,
      visibility: "PUBLIC",
      lifecycleState: "PUBLISHED",
    });
  });

  it("returns unknown when LinkedIn responds 201 without a post ID", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 201 }));

    const result = await publishLinkedInTextPost(
      validInput,
      fetchMock as typeof fetch,
    );

    expect(result.outcome).toBe("unknown");
  });

  it("returns failed when LinkedIn rejects the request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 403 }));

    const result = await publishLinkedInTextPost(
      validInput,
      fetchMock as typeof fetch,
    );

    expect(result).toEqual({
      outcome: "failed",
      message: "LinkedIn rejected the publishing request (HTTP 403).",
    });
  });

  it("returns unknown when the network request fails", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new Error("Network connection lost"));

    const result = await publishLinkedInTextPost(
      validInput,
      fetchMock as typeof fetch,
    );

    expect(result.outcome).toBe("unknown");
  });

  it("returns unknown for an unexpected server response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 500 }));

    const result = await publishLinkedInTextPost(
      validInput,
      fetchMock as typeof fetch,
    );

    expect(result.outcome).toBe("unknown");
  });

  it("rejects invalid input without contacting LinkedIn", async () => {
    const fetchMock = vi.fn();

    const result = await publishLinkedInTextPost(
      {
        ...validInput,
        caption: "   ",
      },
      fetchMock as typeof fetch,
    );

    expect(result).toEqual({
      outcome: "failed",
      message: "A caption is required for LinkedIn publishing.",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
