import { describe, expect, it } from "vitest";

import { imageGenerationCommandSchema } from "./imageGenerationCommandSchema.js";

const validCommand = {
  workspaceId: "507f1f77bcf86cd799439011",
  idempotencyKey: "storm-image-request-0001",
  image: {
    prompt: "A cinematic product photograph with natural light.",
    aspectRatio: "landscape",
  },
};

describe("image generation command", () => {
  it("accepts a valid command", () => {
    expect(imageGenerationCommandSchema.safeParse(validCommand).success).toBe(
      true,
    );
  });

  it("rejects invalid workspace IDs", () => {
    expect(
      imageGenerationCommandSchema.safeParse({
        ...validCommand,
        workspaceId: "invalid",
      }).success,
    ).toBe(false);
  });

  it("rejects invalid idempotency keys", () => {
    expect(
      imageGenerationCommandSchema.safeParse({
        ...validCommand,
        idempotencyKey: "short",
      }).success,
    ).toBe(false);
  });

  it("rejects client-controlled provider fields", () => {
    expect(
      imageGenerationCommandSchema.safeParse({
        ...validCommand,
        provider: "openai",
      }).success,
    ).toBe(false);
  });

  it("rejects client-controlled storage fields", () => {
    expect(
      imageGenerationCommandSchema.safeParse({
        ...validCommand,
        image: {
          ...validCommand.image,
          storageKey: "untrusted-object.png",
        },
      }).success,
    ).toBe(false);
  });
});
