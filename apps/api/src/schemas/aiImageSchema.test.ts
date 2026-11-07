import { describe, expect, it } from "vitest";

import { generateImageSchema } from "./aiImageSchema.js";

const validPrompt = "A minimalist product photograph on a wooden desk.";

describe("generateImageSchema", () => {
  it("accepts a valid image request", () => {
    const result = generateImageSchema.safeParse({
      prompt: validPrompt,
      aspectRatio: "landscape",
    });

    expect(result.success).toBe(true);
  });

  it("defaults to square", () => {
    const result = generateImageSchema.parse({
      prompt: validPrompt,
    });

    expect(result.aspectRatio).toBe("square");
  });

  it("trims the prompt", () => {
    const result = generateImageSchema.parse({
      prompt: `  ${validPrompt}  `,
    });

    expect(result.prompt).toBe(validPrompt);
  });

  it("rejects an empty prompt", () => {
    expect(
      generateImageSchema.safeParse({
        prompt: "",
      }).success,
    ).toBe(false);
  });

  it("rejects short prompts", () => {
    expect(
      generateImageSchema.safeParse({
        prompt: "Cat",
      }).success,
    ).toBe(false);
  });

  it("rejects oversized prompts", () => {
    expect(
      generateImageSchema.safeParse({
        prompt: "a".repeat(3001),
      }).success,
    ).toBe(false);
  });

  it("rejects unsupported aspect ratios", () => {
    expect(
      generateImageSchema.safeParse({
        prompt: validPrompt,
        aspectRatio: "ultrawide",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown fields", () => {
    expect(
      generateImageSchema.safeParse({
        prompt: validPrompt,
        aspectRatio: "square",
        model: "untrusted-model",
        outputPath: "/private/file.png",
      }).success,
    ).toBe(false);
  });

  it("rejects missing prompts", () => {
    expect(
      generateImageSchema.safeParse({
        aspectRatio: "portrait",
      }).success,
    ).toBe(false);
  });
});
