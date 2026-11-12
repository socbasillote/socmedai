import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import MediaAsset from "./MediaAsset.js";

const workspaceId = "507f1f77bcf86cd799439011";

const userId = "507f191e810c19729de860ea";

const logoId = "507f1f77bcf86cd799439012";

const validLogo = {
  storageKey: `workspaces/${workspaceId}/logos/${logoId}.png`,
  sha256: "a".repeat(64),
};

function createAsset(brandingSnapshot?: unknown) {
  return new MediaAsset({
    workspaceId,
    createdByUserId: userId,

    type: "image",
    source: "ai-generated",
    status: "pending",

    generation: {
      provider: "mock",
      model: "storm-mock-image-v1",
      prompt: "Professional coffee product photography.",
      aspectRatio: "square",
    },

    ...(brandingSnapshot === undefined ? {} : { brandingSnapshot }),
  });
}

describe("MediaAsset branding snapshot", () => {
  it("allows legacy assets without a snapshot", async () => {
    const asset = createAsset();

    await expect(asset.validate()).resolves.toBeUndefined();
  });

  it("accepts explicitly unbranded images", async () => {
    const asset = createAsset({
      type: "none",
    });

    await expect(asset.validate()).resolves.toBeUndefined();
  });

  it("accepts a valid logo snapshot", async () => {
    const asset = createAsset({
      type: "logo",
      logo: validLogo,
      position: "bottom-right",
      sizePercent: 20,
      opacity: 0.8,
    });

    await expect(asset.validate()).resolves.toBeUndefined();
  });

  it("accepts a valid text-label snapshot", async () => {
    const asset = createAsset({
      type: "text",
      text: "BREW CO.",
      position: "bottom-right",
      sizePercent: 20,
      opacity: 0.8,
    });

    await expect(asset.validate()).resolves.toBeUndefined();

    expect(asset.brandingSnapshot?.text).toBe("BREW CO.");
  });

  it("rejects text branding without a label", async () => {
    const asset = createAsset({
      type: "text",
      text: "   ",
      position: "bottom-right",
      sizePercent: 20,
      opacity: 0.8,
    });

    await expect(asset.validate()).rejects.toBeInstanceOf(
      mongoose.Error.ValidationError,
    );
  });

  it("rejects mixed logo and text branding", async () => {
    const asset = createAsset({
      type: "text",
      text: "BREW CO.",
      logo: validLogo,
      position: "bottom-right",
      sizePercent: 20,
      opacity: 0.8,
    });

    await expect(asset.validate()).rejects.toBeInstanceOf(
      mongoose.Error.ValidationError,
    );
  });

  it("rejects appearance settings for none", async () => {
    const asset = createAsset({
      type: "none",
      opacity: 0.8,
    });

    await expect(asset.validate()).rejects.toBeInstanceOf(
      mongoose.Error.ValidationError,
    );
  });

  it("rejects cross-workspace logo references", async () => {
    const asset = createAsset({
      type: "logo",
      logo: {
        ...validLogo,
        storageKey:
          "workspaces/507f1f77bcf86cd799439099/logos/507f1f77bcf86cd799439012.png",
      },
      position: "bottom-right",
      sizePercent: 20,
      opacity: 0.8,
    });

    await expect(asset.validate()).rejects.toBeInstanceOf(
      mongoose.Error.ValidationError,
    );
  });

  it("rejects invalid appearance values", async () => {
    const asset = createAsset({
      type: "text",
      text: "BREW CO.",
      position: "bottom-right",
      sizePercent: 50,
      opacity: 2,
    });

    await expect(asset.validate()).rejects.toBeInstanceOf(
      mongoose.Error.ValidationError,
    );
  });
});
