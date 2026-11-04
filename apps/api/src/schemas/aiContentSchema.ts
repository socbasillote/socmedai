import { z } from "zod";

export const generateCaptionSchema = z
  .object({
    brief: z
      .string()
      .trim()
      .min(3, "Enter a topic, product, or campaign brief.")
      .max(3000, "The brief cannot exceed 3,000 characters."),

    platform: z.enum(["facebook", "instagram", "linkedin"]),

    tone: z.enum([
      "professional",
      "friendly",
      "bold",
      "educational",
      "playful",
      "inspirational",
    ]),

    audience: z
      .string()
      .trim()
      .max(500, "The target audience cannot exceed 500 characters.")
      .default("General audience"),

    callToAction: z
      .string()
      .trim()
      .max(300, "The call to action cannot exceed 300 characters.")
      .default(""),

    length: z.enum(["short", "medium", "long"]).default("medium"),
  })
  .strict();

export type GenerateCaptionInput = z.infer<typeof generateCaptionSchema>;

export const reviseCaptionSchema = z
  .object({
    caption: z
      .string()
      .trim()
      .min(1, "Enter a caption to revise.")
      .max(10000, "The caption cannot exceed 10,000 characters."),

    instruction: z
      .string()
      .trim()
      .min(3, "Describe how you want to revise the caption.")
      .max(500, "The revision instruction cannot exceed 500 characters."),

    platform: z.enum(["facebook", "instagram", "linkedin"]),
  })
  .strict();

export type ReviseCaptionInput = z.infer<typeof reviseCaptionSchema>;

/**
 * One response containing exactly three distinct
 * AI-generated caption suggestions.
 *
 * Reuses the existing validated generation input.
 */
export const generateCaptionVariationsSchema = generateCaptionSchema;

export const captionVariationsResponseSchema = z
  .object({
    variations: z
      .array(
        z
          .object({
            style: z.enum(["engaging", "informative", "concise"]),
            caption: z.string().trim().min(1).max(10000),
          })
          .strict(),
      )
      .length(3),
  })
  .strict()
  .superRefine((data, context) => {
    const styles = data.variations.map((variation) => variation.style);

    if (new Set(styles).size !== 3) {
      context.addIssue({
        code: "custom",
        message: "Each caption style must be unique.",
      });
    }

    const captions = data.variations.map((variation) =>
      variation.caption.trim().toLowerCase(),
    );

    if (new Set(captions).size !== 3) {
      context.addIssue({
        code: "custom",
        message: "Captions must not be identical.",
      });
    }
  });

export type GenerateCaptionVariationsInput = z.infer<
  typeof generateCaptionVariationsSchema
>;

export type CaptionVariationsResponse = z.infer<
  typeof captionVariationsResponseSchema
>;
