import { z } from "zod";

export const brandFonts = ["Arial", "Georgia", "Verdana", "Trebuchet MS", "Times New Roman", "Courier New"] as const;
const color = z.string().regex(/^#[a-f\d]{6}$/i).transform((value) => value.toUpperCase());
export const brandKitSchema = z.object({
  enabled: z.boolean(),
  colors: z.object({ primary: color, accent: color, background: color, text: color }).strict(),
  typography: z.object({ headingFont: z.enum(brandFonts), bodyFont: z.enum(brandFonts) }).strict(),
  imageStyle: z.string().trim().max(600),
  layout: z.object({
    textAlignment: z.enum(["left", "center", "right"]),
    logoPosition: z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]),
    spacing: z.enum(["compact", "comfortable", "spacious"]),
    logoVariant: z.enum(["primary", "light", "dark"]),
  }).strict(),
}).strict();
export type BrandKit = z.infer<typeof brandKitSchema>;

export const defaultBrandKit: BrandKit = {
  enabled: true,
  colors: { primary: "#7C3AED", accent: "#F59E0B", background: "#FFFFFF", text: "#0F172A" },
  typography: { headingFont: "Georgia", bodyFont: "Arial" },
  imageStyle: "",
  layout: { textAlignment: "left", logoPosition: "bottom-right", spacing: "comfortable", logoVariant: "primary" },
};

export function readBrandKit(value: unknown): BrandKit {
  const parsed = brandKitSchema.safeParse(value);
  return parsed.success ? parsed.data : structuredClone(defaultBrandKit);
}

export function brandFontFamily(font: BrandKit["typography"]["headingFont"]): string {
  const fallback = font === "Courier New" ? "monospace" : ["Georgia", "Times New Roman"].includes(font) ? "serif" : "sans-serif";
  return `"${font}", ${fallback}`;
}
