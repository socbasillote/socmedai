import { afterEach, expect, it, vi } from "vitest";
import { postGoalCatalog, type PostGoal } from "../services/postGoalCatalog.js";
import { generateCaptionSchema } from "../schemas/aiContentSchema.js";
import { generateImageSchema } from "../schemas/aiImageSchema.js";
process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.OPENAI_API_KEY = "test-only";
const { generateCaption } = await import("../services/aiContentService.js");
afterEach(() => vi.unstubAllGlobals());
it("validates all 20 goals and applies each dedicated server prompt", async () => {
  expect(Object.keys(postGoalCatalog)).toHaveLength(20);
  for (const goal of Object.keys(postGoalCatalog) as PostGoal[]) {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "Generated caption" } }] })));
    vi.stubGlobal("fetch", fetchMock);
    const input = generateCaptionSchema.parse({ brief: "Introduce our coffee menu", platform: "facebook", tone: "friendly", goal });
    await generateCaption(input);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[1].content).toContain(postGoalCatalog[goal]);
    const image = generateImageSchema.parse({ prompt: "A beautiful coffee photograph", goal });
    expect(image.prompt).toContain(postGoalCatalog[goal]);
    // Parsing a queued image again must not duplicate the objective.
    expect(generateImageSchema.parse(image)).toEqual(image);
  }
  expect(generateCaptionSchema.safeParse({ brief: "Coffee", platform: "facebook", tone: "friendly", goal: "unknown" }).success).toBe(false);
});
