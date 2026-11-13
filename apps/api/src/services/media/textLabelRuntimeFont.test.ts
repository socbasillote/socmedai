import { describe, expect, it } from "vitest";
import sharp from "sharp";

async function renderGlyph(family: string): Promise<Buffer> {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg"
         width="256"
         height="128">
      <text
        x="12"
        y="80"
        font-family="${family}"
        font-size="48"
        font-weight="700"
        fill="#ffffff"
      >MWMW</text>
    </svg>
  `;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe("Text-label runtime font diagnostic", () => {
  it("renders visible DejaVu Sans glyphs", async () => {
    const output = await renderGlyph("DejaVu Sans");

    const { data, info } = await sharp(output)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let visiblePixels = 0;

    for (let i = 3; i < data.length; i += info.channels) {
      if (data[i] > 0) {
        visiblePixels++;
      }
    }

    expect(visiblePixels).toBeGreaterThan(0);
  });

  it("produces consistent results within the runtime", async () => {
    const first = await renderGlyph("DejaVu Sans");
    const second = await renderGlyph("DejaVu Sans");

    expect(first.equals(second)).toBe(true);
  });
});
