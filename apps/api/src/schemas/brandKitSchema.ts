import { z } from "zod";

export const brandFontSchema = z.enum(["Arial", "Georgia", "Verdana", "Trebuchet MS", "Times New Roman", "Courier New"]);
export const logoVariantSchema = z.enum(["primary", "light", "dark"]);
const color = z.string().regex(/^#[a-f\d]{6}$/i, "Use a six-digit hex color, such as #7C3AED.").transform((value) => value.toUpperCase());

export const brandKitSchema = z.object({
  enabled: z.boolean(),
  colors: z.object({ primary: color, accent: color, background: color, text: color }).strict(),
  typography: z.object({ headingFont: brandFontSchema, bodyFont: brandFontSchema }).strict(),
  imageStyle: z.string().trim().max(600),
  layout: z.object({
    textAlignment: z.enum(["left", "center", "right"]),
    logoPosition: z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]),
    spacing: z.enum(["compact", "comfortable", "spacious"]),
    logoVariant: logoVariantSchema,
  }).strict(),
}).strict();

export type BrandKit = z.infer<typeof brandKitSchema>;
export type LogoVariant = z.infer<typeof logoVariantSchema>;

/** Missing legacy kits must never enable branding implicitly. */
export function snapshotBrandKit(value: unknown): BrandKit | null {
  const parsed = brandKitSchema.safeParse(value);
  return parsed.success && parsed.data.enabled ? structuredClone(parsed.data) : null;
}
