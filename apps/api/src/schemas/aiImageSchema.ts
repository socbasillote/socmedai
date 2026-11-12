import { z } from "zod";

/**
 * User-facing aspect ratios.
 *
 * The provider adapter translates these
 * into supported provider sizes.
 */
export const imageAspectRatioSchema = z.enum([
  "square",
  "portrait",
  "landscape",
]);

/**
 * Shared positioning options for logo
 * overlays and text labels.
 */
export const imageBrandingPositionSchema = z.enum([
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
]);

const brandingAppearanceSchema = {
  position: imageBrandingPositionSchema.default("bottom-right"),

  sizePercent: z.number().int().min(5).max(30).default(20),

  opacity: z.number().min(0.1).max(1).default(0.8),
};

/**
 * Branding is explicitly selected for each
 * individual image generation request.
 *
 * No branding is the default.
 */
export const imageBrandingSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("none"),
    })
    .strict(),

  z
    .object({
      type: z.literal("logo"),
      ...brandingAppearanceSchema,
    })
    .strict(),

  z
    .object({
      type: z.literal("text"),

      text: z
        .string()
        .trim()
        .min(1, "Enter a text label.")
        .max(80, "The label cannot exceed 80 characters.")
        .refine(
          (value) => !/[\u0000-\u001f\u007f]/u.test(value),
          "Text labels cannot contain control characters.",
        ),

      ...brandingAppearanceSchema,
    })
    .strict(),
]);

export const generateImageSchema = z
  .object({
    prompt: z
      .string()
      .trim()
      .min(10, "Describe the image in at least 10 characters.")
      .max(3000, "The image prompt cannot exceed 3,000 characters."),

    aspectRatio: imageAspectRatioSchema.default("square"),

    branding: imageBrandingSchema.default({ type: "none" }),
  })
  .strict();

export type ImageAspectRatio = z.infer<typeof imageAspectRatioSchema>;

export type ImageBranding = z.infer<typeof imageBrandingSchema>;

/**
 * Incoming image-generation request.
 *
 * Branding and aspectRatio can be omitted.
 * Zod supplies defaults during parsing.
 */
export type GenerateImageInput = z.input<typeof generateImageSchema>;

/**
 * Validated, normalized image-generation request.
 *
 * Defaults have already been applied.
 */
export type ParsedGenerateImageInput = z.output<typeof generateImageSchema>;
