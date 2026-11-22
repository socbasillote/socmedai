import { z } from "zod";

export const visualStyles = ["auto", "cinematic", "editorial", "product-studio", "lifestyle", "minimal", "illustration", "custom"] as const;
export const postImageDesignSchema = z.object({
  style: z.enum(visualStyles),
  details: z.string().trim().max(600).default(""),
  captionContext: z.string().trim().max(5000).default(""),
  text: z.string().trim().max(240).refine(text => text.split("\n").length <= 8 && !/[\u0000-\u0009\u000b-\u001f\u007f]/u.test(text), "Use up to eight lines of image text without control characters.").default(""),
  author: z.string().trim().max(60).refine(text => !/[\u0000-\u001f\u007f]/u.test(text), "Enter an author credit on one line.").default(""),
}).strict().refine(value => !value.author || Boolean(value.text), "Add image text before an author credit.").refine(value => value.style !== "custom" || value.details.length >= 10, "Describe your custom visual style in at least 10 characters.");
export type PostImageDesign = z.infer<typeof postImageDesignSchema>;
