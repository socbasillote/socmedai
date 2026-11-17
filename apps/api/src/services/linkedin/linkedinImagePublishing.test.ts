import { describe, expect, it, vi } from "vitest";
import { publishLinkedInTextPost } from "./linkedinPostService.js";
const input = { accessToken: "token", linkedinMemberId: "member", caption: "Coffee launch", image: new Uint8Array([1, 2, 3]) };
const registration = (url = "https://www.linkedin.com/dms-uploads/image/0") => new Response(JSON.stringify({ value: { image: "urn:li:image:coffee", uploadUrl: url } }), { status: 200 });
describe("LinkedIn image publishing", () => {
  it("uploads bytes before publishing a caption with the returned image URN", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(registration())
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:123" } }));
    expect(await publishLinkedInTextPost(input, transport)).toEqual({ outcome: "published", externalPostId: "urn:li:share:123" });
    expect(JSON.parse(String(transport.mock.calls[0][1]?.body))).toEqual({ initializeUploadRequest: { owner: "urn:li:person:member" } });
    expect(transport.mock.calls[1][1]?.method).toBe("PUT");
    expect(transport.mock.calls[1][1]?.body).toEqual(input.image.buffer);
    expect(JSON.parse(String(transport.mock.calls[2][1]?.body))).toMatchObject({ commentary: input.caption, content: { media: { id: "urn:li:image:coffee" } } });
  });
  it.each(["https://evil.example/dms-uploads/x", "http://www.linkedin.com/dms-uploads/x", "https://www.linkedin.com.evil.example/dms-uploads/x"])("rejects an untrusted upload location: %s", async (url) => {
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(registration(url));
    expect((await publishLinkedInTextPost(input, transport)).outcome).toBe("failed");
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("does not submit a post if uploading fails", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(registration()).mockRejectedValueOnce(new Error("timeout"));
    expect((await publishLinkedInTextPost(input, transport)).outcome).toBe("failed");
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it("preserves unknown outcomes once a public post request has started", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(registration())
      .mockResolvedValueOnce(new Response(null, { status: 201 })).mockRejectedValueOnce(new Error("timeout"));
    expect((await publishLinkedInTextPost(input, transport)).outcome).toBe("unknown");
    expect(transport).toHaveBeenCalledTimes(3);
  });
});
