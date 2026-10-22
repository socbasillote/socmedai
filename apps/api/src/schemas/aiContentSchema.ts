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
