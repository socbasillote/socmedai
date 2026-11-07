import { z } from "zod";

const integerSetting = (fallback: number, max: number) =>
  z.coerce.number().int().min(1).max(max).default(fallback);

const imageGenerationEnvSchema = z
  .object({
    IMAGE_GENERATION_PROVIDER: z.enum(["mock", "openai"]).default("mock"),

    IMAGE_GENERATION_LIVE_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),

    IMAGE_GENERATION_MODEL: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .default("gpt-image-2"),

    IMAGE_GENERATION_DAILY_WORKSPACE_LIMIT: integerSetting(10, 1000),

    IMAGE_GENERATION_MAX_ACTIVE_WORKSPACE: integerSetting(2, 20),
  })
  .strict();

export type ImageGenerationConfig = z.infer<typeof imageGenerationEnvSchema>;

export function parseImageGenerationConfig(
  values: Record<string, unknown>,
): ImageGenerationConfig {
  return imageGenerationEnvSchema.parse(values);
}

/**
 * Parse only the image-generation settings.
 *
 * Other existing Storm environment variables
 * are intentionally ignored.
 */
export function getImageGenerationConfig(): ImageGenerationConfig {
  return parseImageGenerationConfig({
    IMAGE_GENERATION_PROVIDER: process.env.IMAGE_GENERATION_PROVIDER,

    IMAGE_GENERATION_LIVE_ENABLED: process.env.IMAGE_GENERATION_LIVE_ENABLED,

    IMAGE_GENERATION_MODEL: process.env.IMAGE_GENERATION_MODEL,

    IMAGE_GENERATION_DAILY_WORKSPACE_LIMIT:
      process.env.IMAGE_GENERATION_DAILY_WORKSPACE_LIMIT,

    IMAGE_GENERATION_MAX_ACTIVE_WORKSPACE:
      process.env.IMAGE_GENERATION_MAX_ACTIVE_WORKSPACE,
  });
}

export function assertLiveImageGenerationAllowed(
  config: ImageGenerationConfig,
): void {
  if (
    config.IMAGE_GENERATION_PROVIDER === "openai" &&
    !config.IMAGE_GENERATION_LIVE_ENABLED
  ) {
    throw new Error("Live image generation is disabled.");
  }
}
