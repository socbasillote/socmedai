import { createHash } from "node:crypto";
import sharp from "sharp";

import { describe, expect, it } from "vitest";

import { parseImageGenerationConfig } from "../../../config/imageGenerationConfig.js";

import { createImageProvider } from "./imageProviderFactory.js";

import { MockImageProvider } from "./mockImageProvider.js";

import { validateGeneratedImage } from "../imageValidation.js";

const prompt = "A professional product photograph with studio lighting.";

describe("mock image provider", () => {
  const provider = new MockImageProvider();

  it("generates valid PNG bytes", async () => {
    const result = await provider.generate({
      prompt,
      aspectRatio: "square",
    });

    const metadata = await sharp(result.bytes).metadata();

    expect(result.mimeType).toBe("image/png");
    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(1024);
    expect(metadata.height).toBe(1024);
  });

  it("supports portrait dimensions", async () => {
    const result = await provider.generate({
      prompt,
      aspectRatio: "portrait",
    });

    const metadata = await sharp(result.bytes).metadata();

    expect(metadata.width).toBe(1024);
    expect(metadata.height).toBe(1536);
  });

  it("supports landscape dimensions", async () => {
    const result = await provider.generate({
      prompt,
      aspectRatio: "landscape",
    });

    const metadata = await sharp(result.bytes).metadata();

    expect(metadata.width).toBe(1536);
    expect(metadata.height).toBe(1024);
  });

  it("returns deterministic output", async () => {
    const first = await provider.generate({
      prompt,
      aspectRatio: "square",
    });

    const second = await provider.generate({
      prompt,
      aspectRatio: "square",
    });

    const digest = (bytes: Uint8Array) =>
      createHash("sha256").update(bytes).digest("hex");

    expect(digest(first.bytes)).toBe(digest(second.bytes));
  });

  it("produces bytes accepted by Storm image validation", async () => {
    const generated = await provider.generate({
      prompt,
      aspectRatio: "square",
    });

    const validated = await validateGeneratedImage(generated.bytes);

    expect(validated.width).toBe(1024);
    expect(validated.height).toBe(1024);
    expect(validated.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects an invalid prompt", async () => {
    await expect(
      provider.generate({
        prompt: "short",
        aspectRatio: "square",
      }),
    ).rejects.toThrow();
  });

  it("selects the mock provider by default", () => {
    const config = parseImageGenerationConfig({});

    expect(createImageProvider(config)).toBeInstanceOf(MockImageProvider);
  });

  it("cannot create a disabled live provider", () => {
    const config = parseImageGenerationConfig({
      IMAGE_GENERATION_PROVIDER: "openai",
    });

    expect(() => createImageProvider(config)).toThrow(
      "Live image generation is disabled.",
    );
  });

  it("cannot create a live provider before its adapter exists", () => {
    const config = parseImageGenerationConfig({
      IMAGE_GENERATION_PROVIDER: "openai",
      IMAGE_GENERATION_LIVE_ENABLED: "true",
    });

    expect(() => createImageProvider(config)).toThrow(
      "OpenAI image adapter is not installed yet.",
    );
  });
});
