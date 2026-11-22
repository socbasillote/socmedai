import { afterEach, expect, it, vi } from "vitest";
process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.OPENAI_API_KEY = "test-only-caption-key";
const { generateCaption } = await import("../services/aiContentService.js");
const input = { format: "quote" as const, brief: "An original quote about confidence", platform: "facebook" as const, tone: "friendly" as const, audience: "General audience", callToAction: "", length: "short" as const };
afterEach(() => vi.unstubAllGlobals());
it("generates one bounded quote that can be used unchanged in caption and image", async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "Small steps build lasting confidence." } }] }), { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  expect(await generateCaption(input)).toBe("Small steps build lasting confidence.");
  expect(fetch).toHaveBeenCalledOnce();
  const payload = JSON.parse(String((fetch.mock.calls as unknown as [unknown, RequestInit][])[0][1].body));
  expect(payload.messages[1].content).toContain("without surrounding quotation marks, attribution");
  expect(payload.messages[1].content).toContain("240 characters");
});
it("rejects oversized quote output before an image can be requested", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "x".repeat(241) } }] }), { status: 200 })));
  await expect(generateCaption(input)).rejects.toMatchObject({ statusCode: 502 });
});
