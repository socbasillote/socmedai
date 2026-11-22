import { describe, expect, it } from "vitest";

import type { GenerateImageCommand } from "./imageGeneration";

import { snapshotImageGenerationCommand } from "./imageGenerationCommandSnapshot";

function makeCommand(): GenerateImageCommand {
  return {
    idempotencyKey: "original-request-key-0001",

    image: {
      prompt: "A professional photograph of a coffee product.",

      aspectRatio: "square",

      branding: {
        type: "text",
        text: "BREW CO.",
        position: "bottom-right",
        sizePercent: 20,
        opacity: 0.8,
      },
    },
  };
}

describe("Image generation command snapshots", () => {
  it("freezes the style and exact image wording for uncertain retries", () => {
    const original = makeCommand();
    original.image.postDesign = { style: "editorial", details: "Daylight", captionContext: "Coffee", text: "Hello", author: "Ana" };
    const snapshot = snapshotImageGenerationCommand(original);
    original.image.postDesign.style = "cinematic";
    original.image.postDesign.text = "Edited";
    expect(snapshot.image.postDesign).toMatchObject({ style: "editorial", text: "Hello" });
    expect(Object.isFrozen(snapshot.image.postDesign)).toBe(true);
  });
  it("preserves the explicit brand-kit opt-out across retries", () => {
    const original = makeCommand();
    original.image.useBrandKit = false;
    const snapshot = snapshotImageGenerationCommand(original);
    original.image.useBrandKit = true;
    expect(snapshot.image.useBrandKit).toBe(false);
  });
  it("preserves the original text branding", () => {
    const command = snapshotImageGenerationCommand(makeCommand());

    expect(command.image.branding).toEqual({
      type: "text",
      text: "BREW CO.",
      position: "bottom-right",
      sizePercent: 20,
      opacity: 0.8,
    });
  });

  it("does not change when the original command is edited", () => {
    const original = makeCommand();

    const snapshot = snapshotImageGenerationCommand(original);

    original.image.prompt = "A completely different photograph.";

    original.image.aspectRatio = "landscape";

    original.idempotencyKey = "changed-request-key-0002";

    original.image.branding = {
      type: "text",
      text: "STORM STUDIO",
      position: "top-left",
      sizePercent: 30,
      opacity: 1,
    };

    expect(snapshot.idempotencyKey).toBe("original-request-key-0001");

    expect(snapshot.image.prompt).toBe(
      "A professional photograph of a coffee product.",
    );

    expect(snapshot.image.aspectRatio).toBe("square");

    expect(snapshot.image.branding).toMatchObject({
      type: "text",
      text: "BREW CO.",
      position: "bottom-right",
      sizePercent: 20,
      opacity: 0.8,
    });
  });

  it("freezes the nested command objects", () => {
    const command = snapshotImageGenerationCommand(makeCommand());

    expect(Object.isFrozen(command)).toBe(true);
    expect(Object.isFrozen(command.image)).toBe(true);

    expect(Object.isFrozen(command.image.branding)).toBe(true);
  });

  it("supports logo branding snapshots", () => {
    const original: GenerateImageCommand = {
      ...makeCommand(),

      image: {
        prompt: "A branded lifestyle product image.",
        aspectRatio: "portrait",

        branding: {
          type: "logo",
          position: "top-right",
          sizePercent: 25,
          opacity: 0.6,
        },
      },
    };

    const snapshot = snapshotImageGenerationCommand(original);

    expect(snapshot.image.branding).toEqual({
      type: "logo",
      position: "top-right",
      sizePercent: 25,
      opacity: 0.6,
    });
  });

  it("supports unbranded requests", () => {
    const snapshot = snapshotImageGenerationCommand({
      ...makeCommand(),

      image: {
        prompt: "A clean product photograph.",
        aspectRatio: "landscape",
        branding: { type: "none" },
      },
    });

    expect(snapshot.image.branding).toEqual({
      type: "none",
    });
  });

  it("preserves an omitted branding field", () => {
    const snapshot = snapshotImageGenerationCommand({
      ...makeCommand(),

      image: {
        prompt: "A clean product photograph.",
        aspectRatio: "square",
      },
    });

    expect(snapshot.image).not.toHaveProperty("branding");
  });
});

it("keeps the original reference photo and usage immutable across retries", () => {
  const original = makeCommand();
  original.image.reference = { id: "507f1f77bcf86cd799439011", usage: "edit" };
  const snapshot = snapshotImageGenerationCommand(original);
  original.image.reference.usage = "design";
  expect(snapshot.image.reference?.usage).toBe("edit");
  expect(Object.isFrozen(snapshot.image.reference)).toBe(true);
});
