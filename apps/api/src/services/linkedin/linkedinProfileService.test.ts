import { describe, expect, it, vi } from "vitest";

import {
  fetchLinkedInProfile,
  LinkedInProfileLookupError,
} from "./linkedinProfileService.js";

describe("LinkedIn profile service", () => {
  const fetchMock = vi.fn<typeof fetch>();

  it("fetches and maps the authenticated LinkedIn profile", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          sub: "linkedin-member-123",
          name: "Test Member",
          picture: "https://example.com/profile.jpg",
        }),
        { status: 200 },
      ),
    );

    const result = await fetchLinkedInProfile("test-access-token", fetchMock);

    expect(result).toEqual({
      memberId: "linkedin-member-123",
      displayName: "Test Member",
      profilePictureUrl: "https://example.com/profile.jpg",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.linkedin.com/v2/userinfo",
      {
        method: "GET",
        headers: {
          Authorization: "Bearer test-access-token",
        },
      },
    );
  });

  it("allows optional profile fields to be absent", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ sub: "linkedin-member-456" }), {
        status: 200,
      }),
    );

    await expect(
      fetchLinkedInProfile("test-access-token", fetchMock),
    ).resolves.toEqual({
      memberId: "linkedin-member-456",
    });
  });

  it("rejects an empty access token without making a request", async () => {
    fetchMock.mockClear();

    await expect(fetchLinkedInProfile("  ", fetchMock)).rejects.toMatchObject({
      name: "LinkedInProfileLookupError",
      statusCode: 400,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("handles LinkedIn authorization failures safely", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("provider details", { status: 401 }),
    );

    await expect(
      fetchLinkedInProfile("expired-token", fetchMock),
    ).rejects.toMatchObject({
      name: "LinkedInProfileLookupError",
      statusCode: 502,
      message: "LinkedIn could not verify the connected profile.",
    });
  });

  it("handles network failures", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network failure"));

    await expect(
      fetchLinkedInProfile("test-access-token", fetchMock),
    ).rejects.toMatchObject({
      name: "LinkedInProfileLookupError",
      statusCode: 502,
      message: "Unable to contact LinkedIn's profile service.",
    });
  });

  it("rejects malformed profile responses", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ name: "Missing member ID" }), {
        status: 200,
      }),
    );

    await expect(
      fetchLinkedInProfile("test-access-token", fetchMock),
    ).rejects.toMatchObject({
      name: "LinkedInProfileLookupError",
      statusCode: 502,
      message: "LinkedIn returned an invalid profile response.",
    });
  });

  it("handles invalid JSON", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not-json", { status: 200 }));

    await expect(
      fetchLinkedInProfile("test-access-token", fetchMock),
    ).rejects.toMatchObject({
      name: "LinkedInProfileLookupError",
      statusCode: 502,
      message: "LinkedIn returned an invalid profile response.",
    });
  });
});
