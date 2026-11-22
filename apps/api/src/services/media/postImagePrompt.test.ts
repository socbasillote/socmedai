import { describe, expect, it } from "vitest";
import { postImageDesignSchema, visualStyles } from "../../schemas/postImageDesignSchema.js";
import { generateImageSchema } from "../../schemas/aiImageSchema.js";
import { fingerprintImageGeneration } from "../mediaGenerationClaimService.js";
import { postImagePrompt } from "./postImagePrompt.js";

describe("social post visual direction", () => {
  it.each(visualStyles)("builds the %s preset on the backend with user and caption context kept separate", style => {
    const design = postImageDesignSchema.parse({ style, details: "Use bright daylight", captionContext: "Which coffee is your favorite?" });
    const prompt = postImagePrompt("A launch image for iced coffee", "square", design);
    expect(prompt).toContain("A launch image for iced coffee");
    expect(prompt).toContain("Use bright daylight");
    expect(prompt).toContain("Explicit image details take priority");
    expect(prompt).toContain("never text to print");
    expect(prompt).toContain("Do not render the caption, questions, engagement prompts");
    expect(prompt).toContain("Do not invent factual claims");
  });
  it("leaves legacy image prompts unchanged", () => {
    expect(postImagePrompt("An existing image prompt", "portrait")).toBe("An existing image prompt");
  });
  it("makes the final caption's specific angle authoritative over a broader campaign brief", () => {
    const caption = "Pouring cold brew over ice on a hot afternoon.";
    const prompt = postImagePrompt("Promote a full coffee menu", "square", postImageDesignSchema.parse({ style: "cinematic", captionContext: caption }));
    expect(prompt.indexOf(caption)).toBeLessThan(prompt.indexOf("Promote a full coffee menu"));
    expect(prompt).toContain("primary source of the subject");
    expect(prompt).toContain("must not introduce a different subject");
    expect(prompt).toContain("Never invent a second quote");
  });
  it("reserves exact supplied text for app rendering", () => {
    const prompt = postImagePrompt("A quote graphic", "square", postImageDesignSchema.parse({ style: "editorial", text: "Make it count.", author: "Ana" }));
    expect(prompt).toContain("Do not generate any lettering");
    expect(prompt).toContain("app will add");
  });
  it("rejects invalid styles and unrenderable text before a paid request", () => {
    expect(generateImageSchema.safeParse({ prompt: "A useful image description", postDesign: { style: "unknown" } }).success).toBe(false);
    expect(postImageDesignSchema.safeParse({ style: "auto", author: "Someone" }).success).toBe(false);
    expect(postImageDesignSchema.safeParse({ style: "auto", text: "A\n".repeat(10) }).success).toBe(false);
  });
  it("includes style, brand choice, exact wording, and image details in idempotency", () => {
    const image = { prompt: "A useful image description", postDesign: postImageDesignSchema.parse({ style: "cinematic", text: "Hello" }), useBrandKit: false };
    const config = { provider: "mock", model: "test" };
    const original = fingerprintImageGeneration(image, config);
    for (const change of [ { style: "editorial" as const }, { text: "Edited" }, { details: "Daylight" }, { captionContext: "A different angle" } ]) {
      expect(fingerprintImageGeneration({ ...image, postDesign: { ...image.postDesign, ...change } }, config)).not.toBe(original);
    }
    expect(fingerprintImageGeneration({ ...image, useBrandKit: true }, config)).not.toBe(original);
    expect(fingerprintImageGeneration(image, config)).toBe(original);
  });
});
