import type { ImageGenerationConfig } from "../../../config/imageGenerationConfig.js";

import { assertLiveImageGenerationAllowed } from "../../../config/imageGenerationConfig.js";

import type { ImageProvider } from "./imageProvider.js";

import { MockImageProvider } from "./mockImageProvider.js";

export function createImageProvider(
  config: ImageGenerationConfig,
): ImageProvider {
  if (config.IMAGE_GENERATION_PROVIDER === "mock") {
    return new MockImageProvider();
  }

  assertLiveImageGenerationAllowed(config);

  /**
   * The OpenAI adapter is intentionally not
   * available in Step 12.2.1.
   *
   * Even with the live flag enabled,
   * this checkpoint cannot issue a paid request.
   */
  throw new Error("OpenAI image adapter is not installed yet.");
}
