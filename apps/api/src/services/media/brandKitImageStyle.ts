import { snapshotBrandKit, type BrandKit } from "../../schemas/brandKitSchema.js";

export function brandKitImagePrompt(prompt: string, value?: unknown, selectedStyle?: string, options?: { colors: boolean; fonts: boolean }): string {
  const kit = snapshotBrandKit(value);
  if (!kit) return prompt;
  if (options) return [prompt,
    "Optional workspace identity: keep the selected visual aesthetic and requested subject.",
    ...(options.colors ? [`Use brand primary ${kit.colors.primary} and accent ${kit.colors.accent} where appropriate.`] : []),
    ...(options.fonts ? [`For requested text, use headings ${kit.typography.headingFont} and body ${kit.typography.bodyFont}. Do not add text unless requested.`] : []),
    "Choose background and text colors to suit the image and ensure strong readable contrast. Do not inherit the saved workspace background or text color. Do not invent logos.",
  ].join("\n");
  return [
    prompt,
    "Workspace brand direction (use where appropriate; explicit instructions above take priority):",
    `Color roles: primary ${kit.colors.primary}; accent ${kit.colors.accent}. Use accents sparingly for emphasis, quote marks or badges. Choose the background and text colors to suit the image with readable contrast; never inherit the saved workspace background or text color.`,
    `Typography direction for any requested text: headings ${kit.typography.headingFont}, supporting text ${kit.typography.bodyFont}. Do not add text unless requested.`,
    `Composition: ${kit.layout.textAlignment}-aligned text areas, ${kit.layout.spacing} spacing. Keep the ${kit.layout.logoPosition} logo area clear when a logo will be applied; do not invent a logo.`,
    ...(kit.imageStyle ? [selectedStyle && selectedStyle !== "auto"
      ? `Brand finish (support the selected ${selectedStyle} aesthetic; do not replace it): ${kit.imageStyle}`
      : `Image style: ${kit.imageStyle}`] : []),
  ].join("\n");
}

export function brandKitMargin(kit: BrandKit): number {
  return { compact: 0.025, comfortable: 0.04, spacious: 0.06 }[kit.layout.spacing];
}
