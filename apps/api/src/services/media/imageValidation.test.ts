import sharp from "sharp";

import { describe, expect, it } from "vitest";

import {
  ImageValidationError,
  MAX_IMAGE_BYTES,
  validateGeneratedImage,
} from "./imageValidation.js";

async function makeImage(width = 100, height = 80): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#7c3aed",
    },
  })
    .png()
    .toBuffer();
}

describe("validateGeneratedImage", () => {
  it("accepts a valid PNG", async () => {
    const result = await validateGeneratedImage(await makeImage());

    expect(result.mimeType).toBe("image/png");
    expect(result.width).toBe(100);
    expect(result.height).toBe(80);
    expect(result.fileSize).toBe(result.bytes.length);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("normalizes JPEG input to PNG", async () => {
    const jpeg = await sharp(await makeImage())
      .jpeg()
      .toBuffer();

    const result = await validateGeneratedImage(jpeg);

    expect(result.mimeType).toBe("image/png");
    expect((await sharp(result.bytes).metadata()).format).toBe("png");
  });

  it("rejects empty bytes", async () => {
    await expect(
      validateGeneratedImage(new Uint8Array()),
    ).rejects.toBeInstanceOf(ImageValidationError);
  });

  it("rejects invalid image content", async () => {
    await expect(
      validateGeneratedImage(Buffer.from("not a real image")),
    ).rejects.toBeInstanceOf(ImageValidationError);
  });

  it("rejects SVG input", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>',
    );

    await expect(validateGeneratedImage(svg)).rejects.toThrow(
      "Unsupported image format.",
    );
  });

  it("rejects oversized input", async () => {
    await expect(
      validateGeneratedImage(Buffer.alloc(MAX_IMAGE_BYTES + 1)),
    ).rejects.toBeInstanceOf(ImageValidationError);
  });

  it("returns a deterministic hash", async () => {
    const bytes = await makeImage();

    const first = await validateGeneratedImage(bytes);
    const second = await validateGeneratedImage(bytes);

    expect(first.sha256).toBe(second.sha256);
    expect(first.bytes.equals(second.bytes)).toBe(true);
  });
});
