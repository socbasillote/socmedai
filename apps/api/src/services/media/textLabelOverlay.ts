import sharp from "sharp";

import type { ImageBranding } from "../../schemas/aiImageSchema.js";
import { planTextLabelLayout } from "./textLabelLayout.js";

type TextBranding = Extract<ImageBranding, { type: "text" }>;

const MAX_IMAGE_DIMENSION = 16384;

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getOverlayPosition(
  position: TextBranding["position"],
  imageWidth: number,
  imageHeight: number,
  overlayWidth: number,
  overlayHeight: number,
) {
  const margin = Math.max(
    4,
    Math.round(Math.min(imageWidth, imageHeight) * 0.025),
  );

  const left = position.endsWith("right")
    ? imageWidth - overlayWidth - margin
    : margin;

  const top = position.startsWith("bottom")
    ? imageHeight - overlayHeight - margin
    : margin;

  return {
    left: Math.max(0, left),
    top: Math.max(0, top),
  };
}

/**
 * Draw a user-selected text label over generated
 * image bytes using Sharp.
 *
 * This service performs no provider calls, database
 * writes, credit deductions, or storage uploads.
 */
export async function applyTextLabelOverlay(
  imageBytes: Uint8Array,
  branding: TextBranding,
): Promise<Uint8Array> {
  const text = branding.text.trim();

  if (
    text.length < 1 ||
    text.length > 80 ||
    /[\u0000-\u001f\u007f]/u.test(text)
  ) {
    throw new Error("Invalid text-label content.");
  }

  if (
    !Number.isInteger(branding.sizePercent) ||
    branding.sizePercent < 5 ||
    branding.sizePercent > 30 ||
    !Number.isFinite(branding.opacity) ||
    branding.opacity < 0.1 ||
    branding.opacity > 1
  ) {
    throw new Error("Invalid text-label appearance.");
  }

  const validPositions = [
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
  ];

  if (!validPositions.includes(branding.position)) {
    throw new Error("Invalid text-label position.");
  }

  const source = Buffer.from(imageBytes);
  const metadata = await sharp(source).metadata();

  const imageWidth = metadata.width;
  const imageHeight = metadata.height;

  if (
    !imageWidth ||
    !imageHeight ||
    imageWidth > MAX_IMAGE_DIMENSION ||
    imageHeight > MAX_IMAGE_DIMENSION
  ) {
    throw new Error("Invalid generated image dimensions.");
  }

  /**
   * Plan a readable layout before rendering SVG.
   *
   * The planner rejects configurations that
   * cannot fit at the required minimum font size.
   */
  const layout = planTextLabelLayout({
    text,
    imageWidth,
    imageHeight,
    sizePercent: branding.sizePercent,
  });

  const { lines, fontSize, overlayWidth, overlayHeight } = layout;

  const coordinates = getOverlayPosition(
    branding.position,
    imageWidth,
    imageHeight,
    overlayWidth,
    overlayHeight,
  );

  /**
   * Render each line individually.
   *
   * All text originates from the admitted
   * branding snapshot and is SVG-escaped.
   */
  const lineHeight = fontSize * 1.5;

  const totalTextHeight = lines.length * lineHeight;

  const firstBaseline = (overlayHeight - totalTextHeight) / 2 + lineHeight / 2;

  const textElements = lines
    .map((line, index) => {
      const safeLine = escapeSvgText(line);

      const y = firstBaseline + index * lineHeight;

      return `
        <text
          x="${overlayWidth / 2}"
          y="${y}"
          text-anchor="middle"
          dominant-baseline="middle"
          font-family="DejaVu Sans, Arial, sans-serif"
          font-weight="700"
          font-size="${fontSize}"
          fill="#ffffff"
          stroke="#000000"
          stroke-opacity="0.65"
          stroke-width="${Math.max(0.5, fontSize * 0.07)}"
          stroke-linejoin="round"
          paint-order="stroke fill"
        >${safeLine}</text>
      `;
    })
    .join("\n");

  const svg = `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="${overlayWidth}"
      height="${overlayHeight}"
      viewBox="0 0 ${overlayWidth} ${overlayHeight}"
    >
      <g opacity="${branding.opacity}">
        ${textElements}
      </g>
    </svg>
  `;

  const overlayBytes = await sharp(Buffer.from(svg)).png().toBuffer();

  const finalBytes = await sharp(source)
    .composite([
      {
        input: overlayBytes,
        left: coordinates.left,
        top: coordinates.top,
      },
    ])
    .png()
    .toBuffer();

  return new Uint8Array(finalBytes);
}
