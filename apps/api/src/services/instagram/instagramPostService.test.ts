import { describe, expect, it, vi } from "vitest";
import { publishInstagramImage } from "./instagramPostService.js";
import { ScheduledLeaseLostError } from "../publishing/scheduledPublishingHeartbeat.js";
const input = { instagramUserId: "123", accessToken: "secret", caption: "Caption", imageUrl: "https://storage.example/image.jpg" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function transport(last: Response | Error = json({ id: "789" })) {
  return vi.fn().mockResolvedValueOnce(json({ id: "456" })).mockResolvedValueOnce(json({ status_code: "FINISHED" }))
    .mockImplementationOnce(async () => { if (last instanceof Error) throw last; return last; });
}
describe("Instagram image publishing", () => {
  it("creates a container, waits for readiness, then publishes exactly once", async () => {
    const fetcher = transport();
    expect(await publishInstagramImage(input, fetcher)).toEqual({ outcome: "published", externalPostId: "789" });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(String(fetcher.mock.calls[0][0])).toContain("/123/media");
    expect(String(fetcher.mock.calls[2][0])).toContain("/123/media_publish");
    expect(fetcher.mock.calls[2][1].body.get("creation_id")).toBe("456");
    expect(String(fetcher.mock.calls[0][0])).not.toContain("secret");
  });
  it.each([new Error("lost response"), json({}, 500), json({})])("never retries an uncertain publish response", async (response) => {
    const fetcher = transport(response);
    expect((await publishInstagramImage(input, fetcher)).outcome).toBe("unknown");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("preserves a definite provider rejection", async () => {
    expect((await publishInstagramImage(input, transport(json({}, 403)))).outcome).toBe("failed");
  });
  it("does not publish a failed container", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ id: "456" })).mockResolvedValueOnce(json({ status_code: "ERROR" }));
    expect((await publishInstagramImage(input, fetcher)).outcome).toBe("failed");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("polls processing containers with a bound before publication", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ id: "456" })).mockImplementation(async () => json({ status_code: "IN_PROGRESS" }));
    const wait = vi.fn(async () => {});
    expect((await publishInstagramImage(input, fetcher, wait)).outcome).toBe("failed");
    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(wait).toHaveBeenCalledTimes(4);
  });
  it("checks lease ownership immediately before publishing", async () => {
    const fetcher = transport(); let calls = 0;
    await expect(publishInstagramImage({ ...input, beforeRequest: () => { if (++calls === 3) throw new ScheduledLeaseLostError("expired"); } }, fetcher)).rejects.toBeInstanceOf(ScheduledLeaseLostError);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("rejects oversized captions without any request", async () => {
    const fetcher = vi.fn();
    expect((await publishInstagramImage({ ...input, caption: "x".repeat(2201) }, fetcher)).outcome).toBe("failed");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
