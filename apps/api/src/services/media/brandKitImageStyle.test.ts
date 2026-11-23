import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { brandKitSchema, snapshotBrandKit } from "../../schemas/brandKitSchema.js";
import { brandKitImagePrompt } from "./brandKitImageStyle.js";
import { applyTextLabelOverlay } from "./textLabelOverlay.js";
import { applyPostImageText } from "./postImageText.js";

const kit = brandKitSchema.parse({
  enabled: true,
  colors: { primary: "#7c3aed", accent: "#ff9900", background: "#eeeeee", text: "#112233" },
  typography: { headingFont: "Georgia", bodyFont: "Arial" },
  imageStyle: "Warm natural light and soft paper texture.",
  layout: { textAlignment: "left", logoPosition: "top-left", spacing: "spacious", logoVariant: "light" },
});

describe("Brand kit validation and rendering", () => {
  it.each([undefined, { colors: true, fonts: true }])("ignores saved background/text colors in generated quote overlays, including older requests (%s)", async brandOptions => {
    const source = await sharp({ create: { width: 512, height: 512, channels: 3, background: "#224466" } }).png().toBuffer();
    const design = { style: "editorial", text: "Keep going.", author: "Ana", brandOptions };
    const first = await applyPostImageText(source, design, kit);
    const second = await applyPostImageText(source, design, { ...kit, colors: { ...kit.colors, background: "#FF00FF", text: "#00FF00" } });
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });
  it("independently applies primary/accent and fonts without saved background or text colors", () => {
    const colors = brandKitImagePrompt("A cinematic image", kit, "cinematic", { colors: true, fonts: false });
    expect(colors).toContain(kit.colors.primary); expect(colors).toContain(kit.colors.accent);
    expect(colors).not.toContain(kit.colors.background); expect(colors).not.toContain(kit.colors.text);
    expect(colors).not.toContain(kit.typography.headingFont);
    const fonts = brandKitImagePrompt("A cinematic image", kit, "cinematic", { colors: false, fonts: true });
    expect(fonts).toContain(kit.typography.headingFont); expect(fonts).not.toContain(kit.colors.primary);
  });
  it("rejects unsafe colors, fonts, and unsupported layout fields", () => {
    for (const value of [
      { ...kit, colors: { ...kit.colors, text: 'red"/><script>' } },
      { ...kit, typography: { ...kit.typography, headingFont: 'Arial" onload="alert(1)' } },
      { ...kit, layout: { ...kit.layout, logoVariant: "other" } },
      { ...kit, imageStyle: "a".repeat(601) },
    ]) expect(brandKitSchema.safeParse(value).success).toBe(false);
    expect(kit.colors.primary).toBe("#7C3AED");
    expect(snapshotBrandKit(undefined)).toBeNull();
  });
  it("guides imagery with roles and style without changing legacy or disabled requests", () => {
    const prompt = "A new coffee product photograph.";
    const branded = brandKitImagePrompt(prompt, kit);
    expect(branded).toContain("primary #7C3AED");
    expect(branded).toContain("supporting text Arial");
    expect(branded).not.toContain(kit.colors.background);
    expect(branded).not.toContain(kit.colors.text);
    expect(branded).toContain(kit.imageStyle);
    expect(branded).toContain("explicit instructions above take priority");
    expect(brandKitImagePrompt(prompt)).toBe(prompt);
    expect(brandKitImagePrompt(prompt, { ...kit, enabled: false })).toBe(prompt);
  });
  it("renders actual label pixels with the frozen palette, alignment, font, and spacing", async () => {
    const source = await sharp({ create: { width: 512, height: 512, channels: 3, background: "#224466" } }).png().toBuffer();
    const label = { type: "text" as const, text: "Coffee", position: "bottom-left" as const, opacity: 1, sizePercent: 25 };
    const first = Buffer.from(await applyTextLabelOverlay(source, label, kit));
    const second = Buffer.from(await applyTextLabelOverlay(source, label, { ...kit, typography: { ...kit.typography, headingFont: "Courier New" }, layout: { ...kit.layout, textAlignment: "right" } }));
    expect(first.equals(second)).toBe(false);
    const { data, info } = await sharp(first).raw().toBuffer({ resolveWithObject: true });
    const pixels = Array.from({ length: info.width * info.height }, (_, index) => Array.from(data.subarray(index * info.channels, index * info.channels + 3)).join(","));
    expect(pixels).not.toContain("238,238,238"); // Never draw the saved brand background.
    expect(pixels).toContain("255,153,0"); // Accent strip.
  });
});
