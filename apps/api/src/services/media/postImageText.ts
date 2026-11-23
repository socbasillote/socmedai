import sharp from "sharp";
import { snapshotBrandKit } from "../../schemas/brandKitSchema.js";
import { postImageDesignSchema } from "../../schemas/postImageDesignSchema.js";

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const luminance = (rgb: number[]) => rgb.map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, index) => sum + v * [0.2126, 0.7152, 0.0722][index], 0);
export function choosePostTextColor(rgb: number[], palette: string[] = []): string {
  const scene = luminance(rgb);
  const contrast = (color: string) => {
    const ink = luminance([0, 2, 4].map(i => parseInt(color.slice(1 + i, 3 + i), 16)));
    return (Math.max(scene, ink) + 0.05) / (Math.min(scene, ink) + 0.05);
  };
  const ink = rgb[0] > rgb[2] ? "#3B2925" : "#1B2A41";
  const candidates = [...palette, "#FAF7F2", ink];
  return candidates.find(color => contrast(color) >= 4.5) ?? candidates.sort((a, b) => contrast(b) - contrast(a))[0];
}

/** Real glyph measurements keep natural words and line breaks within the crop-safe text area. */
async function wrapText(text: string, width: number, font: string, size: number): Promise<string[]> {
  const measurements = new Map<string, number>();
  async function measure(value: string) {
    if (!value.trim()) return 0;
    if (!measurements.has(value)) {
      const result = await sharp({ text: { text: escape(value), font: `${font} ${size}`, dpi: 72, rgba: true } }).png().toBuffer({ resolveWithObject: true });
      measurements.set(value, result.info.width);
    }
    return measurements.get(value)!;
  }
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (await measure(candidate) <= width) { line = candidate; continue; }
      if (line) { lines.push(line); line = ""; }
      if (await measure(word) <= width) { line = word; continue; }
      for (const character of Array.from(word)) {
        if (line && await measure(line + character) > width) { lines.push(line); line = ""; }
        line += character;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Exact wording, transparent composition, measured typography and image-aware color. */
export async function applyPostImageText(bytes: Uint8Array, value?: unknown, brandKit?: unknown): Promise<Uint8Array> {
  if (!value) return bytes;
  const design = postImageDesignSchema.parse(value);
  if (!design.text) return bytes;
  const identity = snapshotBrandKit(brandKit);
  const kit = design.brandOptions?.fonts === false ? null : identity;
  const { width, height } = await sharp(bytes).metadata();
  if (!width || !height) throw new Error("Invalid image dimensions for post text.");
  const boxWidth = Math.floor(width * 0.6), boxHeight = Math.floor(height * 0.44);
  const padding = Math.max(12, Math.floor(width * 0.025));
  const headingFont = kit?.typography.headingFont ?? (["editorial", "auto"].includes(design.style) ? "Georgia" : "Arial");
  const bodyFont = kit?.typography.bodyFont ?? "Arial";
  let fontSize = Math.floor(Math.min(width, height) * 0.066);
  let lines: string[] = [], authors: string[] = [];
  for (; fontSize >= 12; fontSize -= 2) {
    lines = await wrapText(design.text, boxWidth - padding * 2, headingFont, fontSize);
    authors = design.author ? await wrapText(design.author, boxWidth - padding * 2, bodyFont, Math.round(fontSize * 0.46)) : [];
    if (lines.length * fontSize * 1.22 + (authors.length ? fontSize * 0.6 + authors.length * fontSize * 0.65 : 0) + padding * 2 <= boxHeight) break;
  }
  if (fontSize < 12) throw new Error("Image text is too long for a readable composition.");
  const panelHeight = Math.ceil(lines.length * fontSize * 1.22 + (authors.length ? fontSize * 0.6 + authors.length * fontSize * 0.65 : 0) + padding * 2);
  const left = Math.floor((width - boxWidth) / 2), top = Math.floor((height - panelHeight) / 2);
  const alignment = kit?.layout.textAlignment ?? "center";
  const tx = alignment === "left" ? padding : alignment === "right" ? boxWidth - padding : boxWidth / 2;
  const anchor = alignment === "left" ? "start" : alignment === "right" ? "end" : "middle";
  const quote = lines.map((line, index) => `<text x="${tx}" y="${padding + fontSize + index * fontSize * 1.22}" font-size="${fontSize}" font-family="${escape(headingFont)}" font-weight="400">${escape(line)}</text>`).join("");
  const author = authors.map((line, index) => `<text x="${tx}" y="${padding + lines.length * fontSize * 1.22 + fontSize * 0.85 + index * fontSize * 0.65}" font-size="${Math.round(fontSize * 0.46)}" font-family="${escape(bodyFont)}" letter-spacing="0.6">${escape(line)}</text>`).join("");
  const stats = await sharp(await sharp(bytes).extract({ left, top, width: boxWidth, height: panelHeight }).toBuffer()).stats();
  const palette = identity && design.brandOptions?.colors !== false ? [identity.colors.primary, identity.colors.accent] : [];
  const foreground = choosePostTextColor(stats.channels.slice(0, 3).map(channel => channel.mean), palette);
  const shadow = luminance([0, 2, 4].map(i => parseInt(foreground.slice(i + 1, i + 3), 16))) > 0.5 ? "#000000" : "#FFFFFF";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${boxWidth}" height="${panelHeight}"><defs><filter id="shadow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.4"/></filter></defs><g text-anchor="${anchor}"><g fill="${shadow}" opacity="0.28" transform="translate(0,1.5)" filter="url(#shadow)">${quote}${author}</g><g fill="${foreground}">${quote}${author}</g></g></svg>`;
  return sharp(bytes).composite([{ input: Buffer.from(svg), left, top }]).png().toBuffer();
}
