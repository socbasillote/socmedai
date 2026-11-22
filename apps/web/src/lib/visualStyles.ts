export const visualStyles = [
  { id: "auto", name: "Auto", description: "Let AI choose a look that fits your post.", position: "50% 0%" },
  { id: "cinematic", name: "Cinematic", description: "Dramatic lighting and atmospheric depth.", position: "0% 0%" },
  { id: "editorial", name: "Editorial", description: "Refined framing and a magazine finish.", position: "50% 0%" },
  { id: "product-studio", name: "Product Studio", description: "Clean backdrops and controlled lighting.", position: "100% 0%" },
  { id: "lifestyle", name: "Lifestyle", description: "Natural light and everyday warmth.", position: "0% 100%" },
  { id: "minimal", name: "Minimal", description: "Simple composition and generous space.", position: "50% 100%" },
  { id: "illustration", name: "Illustration", description: "Expressive shapes and painted texture.", position: "100% 100%" },
  { id: "custom", name: "Custom style", description: "Describe your own visual direction.", position: "50% 100%" },
] as const;
export type VisualStyle = typeof visualStyles[number]["id"];
export type PostImageDesign = { style: VisualStyle; details: string; captionContext: string; text: string; author: string };
export function normalizeVisualStyle(value?: string): VisualStyle {
  if (value === "Illustration") return "illustration";
  if (value === "Minimal") return "minimal";
  return visualStyles.find(style => style.id === value)?.id ?? "auto";
}
