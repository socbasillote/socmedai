import { describe, expect, it } from "vitest";
import { defaultBrandKit } from "@/lib/brandKit";
import { backgroundPrompt, newTemplateDraft, templateProblem, templateCaption } from "./templates";
import { wrapTemplateText } from "./renderTemplate";

describe("post template contracts", () => {
  it("requires an explicit brand decision, then the selected design's fields", () => {
    const draft = newTemplateDraft("quote");
    expect(templateProblem(draft)).toContain("brand kit");
    draft.brandChoice = "no";
    expect(templateProblem(draft)).toBe("Enter quote.");
    draft.values.quote = "A useful thought";
    expect(templateProblem(draft)).toBeNull();
  });
  it("requires a real product image", () => {
    const draft = { ...newTemplateDraft("product"), brandChoice: "no" as const, values: { name: "Coffee" } };
    expect(templateProblem(draft)).toBe("Upload a product photo.");
    expect(templateProblem({ ...draft, photoAssetId: "507f1f77bcf86cd799439011" })).toBeNull();
  });
  it("does not leak brand direction when declined", () => {
    const draft = newTemplateDraft("sale");
    expect(backgroundPrompt(draft)).not.toContain(defaultBrandKit.colors.primary);
    expect(backgroundPrompt(draft, defaultBrandKit)).toContain(defaultBrandKit.colors.primary);
  });
  it("allows custom image subjects and excludes the image brief from the caption", () => {
    const draft = { ...newTemplateDraft("custom"), values: { brief: "A person holding a coffee", headline: "Hello" } };
    expect(backgroundPrompt(draft)).toContain(draft.values.brief);
    expect(backgroundPrompt(draft)).not.toContain("people, or products");
    expect(templateCaption(draft)).toBe("Hello");
  });
  it("wraps long words and preserves explicit line breaks", () => {
    const context = { measureText: (s: string) => ({ width: s.length * 10 }) as TextMetrics };
    const lines = wrapTemplateText(context, "Extraordinary\nHello world", 60);
    expect(lines.every(line => line.length <= 6)).toBe(true);
    expect(lines.join("").replace(/\s/g, "")).toBe("ExtraordinaryHelloworld");
  });
});
