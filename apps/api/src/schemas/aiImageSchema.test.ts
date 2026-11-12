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

describe("optional image branding", () => {
  const prompt = "A premium coffee product photograph with studio lighting.";

  it("defaults to no branding", () => {
    const result = generateImageSchema.parse({
      prompt,
    });

    expect(result.branding).toEqual({
      type: "none",
    });

    expect(result.aspectRatio).toBe("square");
  });

  it("accepts explicitly disabled branding", () => {
    const result = generateImageSchema.parse({
      prompt,
      branding: {
        type: "none",
      },
    });

    expect(result.branding.type).toBe("none");
  });

  it("accepts logo branding and applies defaults", () => {
    const result = generateImageSchema.parse({
      prompt,
      branding: {
        type: "logo",
      },
    });

    expect(result.branding).toEqual({
      type: "logo",
      position: "bottom-right",
      sizePercent: 20,
      opacity: 0.8,
    });
  });

  it("accepts text labels", () => {
    const result = generateImageSchema.parse({
      prompt,
      branding: {
        type: "text",
        text: "  BREW CO.  ",
      },
    });

    expect(result.branding).toEqual({
      type: "text",
      text: "BREW CO.",
      position: "bottom-right",
      sizePercent: 20,
      opacity: 0.8,
    });
  });

  it("rejects empty text labels", () => {
    expect(
      generateImageSchema.safeParse({
        prompt,
        branding: {
          type: "text",
          text: "   ",
        },
      }).success,
    ).toBe(false);
  });

  it("rejects invalid logo size and opacity", () => {
    expect(
      generateImageSchema.safeParse({
        prompt,
        branding: {
          type: "logo",
          sizePercent: 50,
          opacity: 1.5,
        },
      }).success,
    ).toBe(false);
  });

  it("rejects unexpected branding properties", () => {
    expect(
      generateImageSchema.safeParse({
        prompt,
        branding: {
          type: "none",
          storageKey: "workspaces/other-workspace/logo.png",
        },
      }).success,
    ).toBe(false);
  });
});
