import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { planTextLabelLayout } from "./textLabelLayout.js";

import { applyTextLabelOverlay } from "./textLabelOverlay.js";

const IMAGE_SIZES = [
  {
    name: "square",
    width: 1024,
    height: 1024,
  },
  {
    name: "portrait",
    width: 1024,
    height: 1536,
  },
  {
    name: "landscape",
    width: 1536,
    height: 1024,
  },
] as const;

const LABELS = [
  "BREW CO.",
  "STORM STUDIO",
  "WWWWWWWWWW",
  "MMMMMMMMMM",
  "STORM CREATIVE STUDIO",
] as const;

function escapeSvg(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Measure the visible pixels using the current
 * SVG font renderer.
 *
 * This is a regression check for the present
 * environment, not cross-platform certification.
 */
async function measureTextWidth(
  text: string,
  fontSize: number,
): Promise<number> {
  const svg = `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="4096"
      height="128"
    >
      <text
        x="40"
        y="64"
        font-family="sans-serif"
        font-weight="700"
        font-size="${fontSize}"
        fill="#ffffff"
      >${escapeSvg(text)}</text>
    </svg>
  `;

  const output = await sharp(Buffer.from(svg)).trim().png().toBuffer({
    resolveWithObject: true,
  });

  return output.info.width;
}

describe("Text-label aspect ratio compatibility", () => {
  for (const size of IMAGE_SIZES) {
    describe(size.name, () => {
      it.each(LABELS)("fits the measured label: %s", async (text) => {
        const layout = planTextLabelLayout({
          text,
          imageWidth: size.width,
          imageHeight: size.height,
          sizePercent: 20,
        });

        const margin = Math.max(
          4,
          Math.round(Math.min(size.width, size.height) * 0.025),
        );

        const padding = Math.max(2, Math.round(layout.overlayWidth * 0.025));

        const availableWidth = layout.overlayWidth - padding * 2;

        expect(layout.overlayWidth).toBeLessThanOrEqual(
          size.width - margin * 2,
        );

        expect(layout.overlayHeight).toBeLessThanOrEqual(
          size.height - margin * 2,
        );

        expect(layout.lines.length).toBeLessThanOrEqual(5);

        expect(layout.fontSize).toBeGreaterThanOrEqual(12);

        for (const line of layout.lines) {
          const width = await measureTextWidth(line, layout.fontSize);

          expect(
            width,
            `Text line "${line}" exceeds its planned width.`,
          ).toBeLessThanOrEqual(availableWidth);
        }
      });

      it("renders the complete PNG at the correct dimensions", async () => {
        const source = await sharp({
          create: {
            width: size.width,
            height: size.height,
            channels: 4,
            background: "#566b76",
          },
        })
          .png()
          .toBuffer();

        const output = await applyTextLabelOverlay(source, {
          type: "text",
          text: "STORM CREATIVE STUDIO",
          position: "bottom-right",
          sizePercent: 20,
          opacity: 0.8,
        });

        const metadata = await sharp(Buffer.from(output)).metadata();

        expect(metadata.format).toBe("png");
        expect(metadata.width).toBe(size.width);
        expect(metadata.height).toBe(size.height);

        expect(Buffer.from(output).equals(source)).toBe(false);
      });
    });
  }
});
