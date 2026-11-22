import { snapshotBrandKit, type BrandKit } from "../../schemas/brandKitSchema.js";

export function brandKitImagePrompt(prompt: string, value?: unknown, selectedStyle?: string): string {
  const kit = snapshotBrandKit(value);
  if (!kit) return prompt;
  return [
    prompt,
    "Workspace brand direction (use where appropriate; explicit instructions above take priority):",
    `Color roles: primary ${kit.colors.primary}; accent ${kit.colors.accent}; background ${kit.colors.background}; text ${kit.colors.text}. Use accents sparingly for emphasis, quote marks or badges.`,
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
