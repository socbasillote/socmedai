import sharp from "sharp";
import { createHash } from "node:crypto";

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 16_384;
export const MAX_IMAGE_PIXELS = 40_000_000;

export class ImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageValidationError";
  }
}

export type ValidatedImage = {
  bytes: Buffer;
  mimeType: "image/png";
  width: number;
  height: number;
  fileSize: number;
  sha256: string;
};

export async function validateGeneratedImage(
  input: Uint8Array,
): Promise<ValidatedImage> {
  if (
    !(input instanceof Uint8Array) ||
    input.byteLength === 0 ||
    input.byteLength > MAX_IMAGE_BYTES
  ) {
    throw new ImageValidationError(
      "Image data is empty or exceeds the 20 MB limit.",
    );
  }

  try {
    const source = sharp(input, {
      failOn: "error",
      limitInputPixels: MAX_IMAGE_PIXELS,
      animated: false,
    });

    const metadata = await source.metadata();

    if (!["png", "jpeg", "webp"].includes(metadata.format ?? "")) {
      throw new ImageValidationError("Unsupported image format.");
    }

    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width > MAX_IMAGE_DIMENSION ||
      metadata.height > MAX_IMAGE_DIMENSION ||
      metadata.width * metadata.height > MAX_IMAGE_PIXELS ||
      (metadata.pages ?? 1) !== 1
    ) {
      throw new ImageValidationError(
        "Invalid image dimensions or multiple frames.",
      );
    }

    // Re-encode to normalize the format and remove
    // source metadata before storing.
    const normalized = await sharp(input, {
      failOn: "error",
      limitInputPixels: MAX_IMAGE_PIXELS,
      animated: false,
    })
      .rotate()
      .png()
      .toBuffer({ resolveWithObject: true });

    const bytes = normalized.data;
    const { width, height } = normalized.info;

    if (
      width < 1 ||
      height < 1 ||
      width > MAX_IMAGE_DIMENSION ||
      height > MAX_IMAGE_DIMENSION ||
      bytes.length > MAX_IMAGE_BYTES
    ) {
      throw new ImageValidationError(
        "Normalized image exceeds storage limits.",
      );
    }

    return {
      bytes,
      mimeType: "image/png",
      width,
      height,
      fileSize: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  } catch (error) {
    if (error instanceof ImageValidationError) {
      throw error;
    }

    throw new ImageValidationError("Image data could not be decoded.");
  }
}
