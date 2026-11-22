import { expect, it } from "vitest";
import { aiPostTypes, aiPostContentProblem, buildAIPostBrief } from "./aiPostTypes";

it("requires a type and the content required by that type", () => {
  expect(aiPostContentProblem(null, {}, "A useful brief")).toBe("Choose a post type.");
  expect(aiPostContentProblem("product", { name: "Coffee" }, "")).toBe("Enter key benefit.");
  expect(aiPostContentProblem("custom", {}, "A useful brief")).toBeNull();
});
it("preserves a supplied quote and author, but never carries them into topic mode", () => {
  const content = { mode: "supplied", quote: 'Keep going & grow.', author: "Ana", topic: "Confidence" };
  expect(buildAIPostBrief("quote", content, "")).toContain("Quote: Keep going & grow.");
  const topic = buildAIPostBrief("quote", { ...content, mode: "topic" }, "");
  expect(topic).toContain("original quote"); expect(topic).toContain("unattributed");
  expect(topic).not.toContain("Keep going"); expect(topic).not.toContain("Ana");
});
it("validates dates and registration links before generation", () => {
  expect(aiPostContentProblem("event", { name: "Launch", date: "2027-02-30" }, "")).toContain("valid event date");
  expect(aiPostContentProblem("event", { name: "Launch", date: "2027-02-20", link: "javascript:alert(1)" }, "")).toContain("valid registration link");
});
it("keeps complete structured content within the caption request budget", () => {
  for (const definition of aiPostTypes.filter(type => type.id !== "custom")) {
    const content = Object.fromEntries(definition.fields.map(field => [field.key, "x".repeat(field.max)]));
    expect(buildAIPostBrief(definition.id, content, "").length).toBeLessThan(2750);
  }
  expect(buildAIPostBrief("custom", {}, "A useful brief")).toBe("A useful brief");
});
