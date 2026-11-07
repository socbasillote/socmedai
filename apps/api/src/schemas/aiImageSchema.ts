import { z } from "zod";

/**
 * User-facing aspect ratios.
 *
 * The image provider adapter will translate
 * these values into supported provider sizes.
 */
export const imageAspectRatioSchema = z.enum([
  "square",
  "portrait",
  "landscape",
]);

export const generateImageSchema = z
  .object({
    prompt: z
      .string()
      .trim()
      .min(10, "Describe the image in at least 10 characters.")
      .max(3000, "The image prompt cannot exceed 3,000 characters."),

    aspectRatio: imageAspectRatioSchema.default("square"),
  })
  .strict();

export type ImageAspectRatio = z.infer<typeof imageAspectRatioSchema>;

export type GenerateImageInput = z.infer<typeof generateImageSchema>;
