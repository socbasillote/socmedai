import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { applyTextLabelOverlay } from "./textLabelOverlay.js";

async function makeSourceImage() {
  return sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: "#566b76",
    },
  })
    .png()
    .toBuffer();
}

const textBranding = {
  type: "text" as const,
  text: "BREW CO.",
  position: "bottom-right" as const,
  sizePercent: 20,
  opacity: 0.8,
};

async function countChangedPixels(
  originalBytes: Uint8Array,
  brandedBytes: Uint8Array,
  region: {
    left: number;
    top: number;
    width: number;
    height: number;
  },
): Promise<number> {
  const original = await sharp(Buffer.from(originalBytes))
    .extract(region)
    .ensureAlpha()
    .raw()
    .toBuffer();

  const branded = await sharp(Buffer.from(brandedBytes))
    .extract(region)
    .ensureAlpha()
    .raw()
    .toBuffer();

  let changed = 0;

  for (let i = 0; i < original.length; i += 4) {
    if (
      original[i] !== branded[i] ||
      original[i + 1] !== branded[i + 1] ||
      original[i + 2] !== branded[i + 2] ||
      original[i + 3] !== branded[i + 3]
    ) {
      changed++;
    }
  }

  return changed;
}

describe("Sharp text-label overlay", () => {
  it("renders a valid PNG", async () => {
    const source = await makeSourceImage();

    const result = await applyTextLabelOverlay(source, textBranding);

    const metadata = await sharp(Buffer.from(result)).metadata();

    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(512);
    expect(metadata.height).toBe(512);
  });

  it("modifies the original image", async () => {
    const source = await makeSourceImage();

    const result = await applyTextLabelOverlay(source, textBranding);

    expect(Buffer.from(result).equals(source)).toBe(false);
  });

  it("produces consistent bytes for identical input", async () => {
    const source = await makeSourceImage();

    const first = await applyTextLabelOverlay(source, textBranding);

    const second = await applyTextLabelOverlay(source, textBranding);

    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });

  it("supports different label positions", async () => {
    const source = await makeSourceImage();

    const left = await applyTextLabelOverlay(source, {
      ...textBranding,
      position: "top-left",
    });

    const right = await applyTextLabelOverlay(source, {
      ...textBranding,
      position: "bottom-right",
    });

    expect(Buffer.from(left).equals(Buffer.from(right))).toBe(false);
  });

  it("escapes special XML characters", async () => {
    const source = await makeSourceImage();

    const result = await applyTextLabelOverlay(source, {
      ...textBranding,
      text: 'COFFEE & <BREW> "CO."',
    });

    const metadata = await sharp(Buffer.from(result)).metadata();

    expect(metadata.format).toBe("png");
  });

  it("rejects control characters", async () => {
    const source = await makeSourceImage();

    await expect(
      applyTextLabelOverlay(source, {
        ...textBranding,
        text: "BREW\nCO.",
      }),
    ).rejects.toThrow("Invalid text-label content.");
  });

  it("rejects invalid opacity", async () => {
    const source = await makeSourceImage();

    await expect(
      applyTextLabelOverlay(source, {
        ...textBranding,
        opacity: 2,
      }),
    ).rejects.toThrow("Invalid text-label appearance.");
  });

  it("renders visible text in the selected bottom-right area", async () => {
    const source = await makeSourceImage();

    const result = await applyTextLabelOverlay(source, {
      ...textBranding,
      text: "BREW CO.",
      position: "bottom-right",
      opacity: 1,
    });

    const bottomRight = await countChangedPixels(source, result, {
      left: 350,
      top: 350,
      width: 162,
      height: 162,
    });

    const topLeft = await countChangedPixels(source, result, {
      left: 0,
      top: 0,
      width: 162,
      height: 162,
    });

    // Text must actually produce visible pixels.
    expect(bottomRight).toBeGreaterThan(0);

    // An overlay placed bottom-right must not
    // modify the opposite corner.
    expect(topLeft).toBe(0);
  });

  it("renders visible text in the selected top-left area", async () => {
    const source = await makeSourceImage();

    const result = await applyTextLabelOverlay(source, {
      ...textBranding,
      text: "BREW CO.",
      position: "top-left",
      opacity: 1,
    });

    const topLeft = await countChangedPixels(source, result, {
      left: 0,
      top: 0,
      width: 162,
      height: 162,
    });

    const bottomRight = await countChangedPixels(source, result, {
      left: 350,
      top: 350,
      width: 162,
      height: 162,
    });

    expect(topLeft).toBeGreaterThan(0);
    expect(bottomRight).toBe(0);
  });

  it("renders different visible pixels for different labels", async () => {
    const source = await makeSourceImage();

    const first = await applyTextLabelOverlay(source, {
      ...textBranding,
      text: "BREW CO.",
      opacity: 1,
    });

    const second = await applyTextLabelOverlay(source, {
      ...textBranding,
      text: "STORM",
      opacity: 1,
    });

    const changed = await countChangedPixels(first, second, {
      left: 350,
      top: 350,
      width: 162,
      height: 162,
    });

    expect(changed).toBeGreaterThan(0);
  });

  it("rejects long labels that cannot fit readably", async () => {
    const source = await makeSourceImage();

    const longLabel = "STORM BRAND ".repeat(6).trim();

    expect(longLabel.length).toBeLessThanOrEqual(80);

    await expect(
      applyTextLabelOverlay(source, {
        ...textBranding,
        text: longLabel,
        position: "bottom-right",
        sizePercent: 5,
        opacity: 1,
      }),
    ).rejects.toThrow();
  });

  it("renders wrapped text visibly", async () => {
    const source = await makeSourceImage();

    const result = await applyTextLabelOverlay(source, {
      ...textBranding,
      text: "STORM CREATIVE STUDIO",
      position: "bottom-right",
      sizePercent: 20,
      opacity: 1,
    });

    const metadata = await sharp(Buffer.from(result)).metadata();

    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(512);
    expect(metadata.height).toBe(512);

    const changed = await countChangedPixels(source, result, {
      left: 350,
      top: 350,
      width: 162,
      height: 162,
    });

    expect(changed).toBeGreaterThan(0);
  });

  it("produces deterministic multiline PNG bytes", async () => {
    const source = await makeSourceImage();

    const branding = {
      ...textBranding,
      text: "STORM CREATIVE STUDIO",
      position: "bottom-right" as const,
      sizePercent: 20,
      opacity: 0.8,
    };

    const first = await applyTextLabelOverlay(source, branding);

    const second = await applyTextLabelOverlay(source, branding);

    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });

  it("rejects unreadable labels instead of shrinking to one pixel", async () => {
    const source = await makeSourceImage();

    await expect(
      applyTextLabelOverlay(source, {
        ...textBranding,
        text: "A".repeat(80),
        sizePercent: 5,
      }),
    ).rejects.toThrow("Text label is too long for the selected size.");
  });
});
