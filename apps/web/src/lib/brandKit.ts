import { z } from "zod";

export const brandFonts = ["Arial", "Georgia", "Verdana", "Trebuchet MS", "Times New Roman", "Courier New"] as const;
const color = z.string().regex(/^#[a-f\d]{6}$/i).transform((value) => value.toUpperCase());
export const brandKitSchema = z.object({
  enabled: z.boolean(),
  // Accept legacy text values for compatibility; text is no longer configurable or used for rendering.
  colors: z.object({ primary: color, accent: color, background: color, text: color.optional().default("#111827") }).strict(),
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

export function readableTextColor(background: string): string {
  const hex = /^#[a-f\d]{6}$/i.test(background) ? background.slice(1) : "FFFFFF";
  const channels = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.0592 ? "#FFFFFF" : "#111827";
}

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
