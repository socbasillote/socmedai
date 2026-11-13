import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { planTextLabelLayout } from "./textLabelLayout.js";

const FONT_FAMILY = "sans-serif";

async function measureRenderedTextWidth(
  text: string,
  fontSize: number,
): Promise<number> {
  const safeText = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

  // Wide transparent canvas to prevent the
  // measurement itself from clipping glyphs.
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg"
         width="4096"
         height="128">
      <text
        x="40"
        y="64"
        font-family="sans-serif"
        font-size="${fontSize}"
        font-weight="700"
        fill="#ffffff"
      >${safeText}</text>
    </svg>
  `;

  const result = await sharp(Buffer.from(svg))
    .trim()
    .png()
    .toBuffer({ resolveWithObject: true });

  return result.info.width;
}

describe("Sharp text font metrics", () => {
  it.each([
    "BREW CO.",
    "STORM STUDIO",
    "WWWWWWWWWW",
    "MMMMMMMMMM",
    "STORM CREATIVE STUDIO",
  ])("fits measured glyphs within the planned width: %s", async (text) => {
    const layout = planTextLabelLayout({
      text,
      imageWidth: 512,
      imageHeight: 512,
      sizePercent: 20,
    });

    const padding = Math.max(2, Math.round(layout.overlayWidth * 0.025));

    const usableWidth = layout.overlayWidth - padding * 2;

    for (const line of layout.lines) {
      const measuredWidth = await measureRenderedTextWidth(
        line,
        layout.fontSize,
      );

      expect(
        measuredWidth,
        `The font rendered "${line}" wider than the planned text area.`,
      ).toBeLessThanOrEqual(usableWidth);
    }
  });
});
