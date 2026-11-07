import { describe, expect, it } from "vitest";

import {
  assertLiveImageGenerationAllowed,
  parseImageGenerationConfig,
} from "./imageGenerationConfig.js";

describe("image generation configuration", () => {
  it("defaults to a disabled mock provider", () => {
    const config = parseImageGenerationConfig({});

    expect(config.IMAGE_GENERATION_PROVIDER).toBe("mock");
    expect(config.IMAGE_GENERATION_LIVE_ENABLED).toBe(false);
  });

  it("sets conservative quota defaults", () => {
    const config = parseImageGenerationConfig({});

    expect(config.IMAGE_GENERATION_DAILY_WORKSPACE_LIMIT).toBe(10);

    expect(config.IMAGE_GENERATION_MAX_ACTIVE_WORKSPACE).toBe(2);
  });

  it("accepts valid quota overrides", () => {
    const config = parseImageGenerationConfig({
      IMAGE_GENERATION_DAILY_WORKSPACE_LIMIT: "25",
      IMAGE_GENERATION_MAX_ACTIVE_WORKSPACE: "3",
    });

    expect(config.IMAGE_GENERATION_DAILY_WORKSPACE_LIMIT).toBe(25);

    expect(config.IMAGE_GENERATION_MAX_ACTIVE_WORKSPACE).toBe(3);
  });

  it("rejects invalid quotas", () => {
    expect(() =>
      parseImageGenerationConfig({
        IMAGE_GENERATION_DAILY_WORKSPACE_LIMIT: "0",
      }),
    ).toThrow();

    expect(() =>
      parseImageGenerationConfig({
        IMAGE_GENERATION_MAX_ACTIVE_WORKSPACE: "2.5",
      }),
    ).toThrow();
  });

  it("requires explicit enablement for OpenAI", () => {
    const config = parseImageGenerationConfig({
      IMAGE_GENERATION_PROVIDER: "openai",
    });

    expect(() => assertLiveImageGenerationAllowed(config)).toThrow(
      "Live image generation is disabled.",
    );
  });

  it("rejects unknown provider names", () => {
    expect(() =>
      parseImageGenerationConfig({
        IMAGE_GENERATION_PROVIDER: "unknown",
      }),
    ).toThrow();
  });
});
