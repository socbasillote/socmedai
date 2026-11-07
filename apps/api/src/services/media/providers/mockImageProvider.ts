import { createHash } from "node:crypto";
import sharp from "sharp";

import { generateImageSchema } from "../../../schemas/aiImageSchema.js";

import type {
  ImageProvider,
  ImageProviderRequest,
  ImageProviderResult,
} from "./imageProvider.js";

const DIMENSIONS = {
  square: {
    width: 1024,
    height: 1024,
  },
  portrait: {
    width: 1024,
    height: 1536,
  },
  landscape: {
    width: 1536,
    height: 1024,
  },
} as const;

/**
 * Generates genuine PNG bytes entirely locally.
 *
 * The same normalized request always produces
 * the same image, supporting deterministic tests.
 */
export class MockImageProvider implements ImageProvider {
  readonly provider = "mock";
  readonly model = "storm-mock-image-v1";

  async generate(request: ImageProviderRequest): Promise<ImageProviderResult> {
    const input = generateImageSchema.parse(request);

    const { width, height } = DIMENSIONS[input.aspectRatio];

    const hash = createHash("sha256")
      .update(JSON.stringify([input.prompt, input.aspectRatio]))
      .digest("hex");

    const background = `#${hash.slice(0, 6)}`;

    const bytes = await sharp({
      create: {
        width,
        height,
        channels: 3,
        background,
      },
    })
      .png()
      .toBuffer();

    return {
      bytes,
      mimeType: "image/png",
      provider: this.provider,
      model: this.model,
    };
  }
}
