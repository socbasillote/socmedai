import sharp from "sharp";
import { snapshotBrandKit } from "../../schemas/brandKitSchema.js";
import { postImageDesignSchema } from "../../schemas/postImageDesignSchema.js";

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
function linesFor(text: string, maxCharacters: number): string[] {
  return text.split("\n").flatMap(paragraph => {
    const lines: string[] = [];
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && Array.from(`${line} ${word}`).length > maxCharacters) { lines.push(line); line = ""; }
      for (const char of Array.from(word)) {
        if (Array.from(line).length >= maxCharacters) { lines.push(line); line = ""; }
        line += char;
      }
      line += " ";
    }
    lines.push(line.trimEnd());
    return lines;
  });
}
/** Exact supplied wording is rendered after AI, within the area shared by all platform crops. */
export async function applyPostImageText(bytes: Uint8Array, value?: unknown, brandKit?: unknown): Promise<Uint8Array> {
  if (!value) return bytes;
  const design = postImageDesignSchema.parse(value);
  if (!design.text) return bytes;
  const kit = snapshotBrandKit(brandKit);
  const { width, height } = await sharp(bytes).metadata();
  if (!width || !height) throw new Error("Invalid image dimensions for post text.");
  const boxWidth = Math.floor(width * 0.6), boxHeight = Math.floor(height * 0.44);
  const padding = Math.max(12, Math.floor(width * 0.025));
  let fontSize = Math.floor(Math.min(width, height) * 0.052);
  let lines: string[] = [], authors: string[] = [];
  for (; fontSize >= 12; fontSize--) {
    lines = linesFor(design.text, Math.max(1, Math.floor((boxWidth - padding * 2) / fontSize)));
    authors = design.author ? linesFor(design.author, Math.max(1, Math.floor((boxWidth - padding * 2) / (fontSize * 0.6)))) : [];
    if (lines.length * fontSize * 1.4 + (authors.length ? fontSize * 0.5 + authors.length * fontSize * 0.85 : 0) + padding * 2 <= boxHeight) break;
  }
  if (fontSize < 12) throw new Error("Image text is too long for a readable composition.");
  const panelHeight = Math.ceil(lines.length * fontSize * 1.4 + (authors.length ? fontSize * 0.5 + authors.length * fontSize * 0.85 : 0) + padding * 2);
  const left = Math.floor((width - boxWidth) / 2), top = Math.floor((height - panelHeight) / 2);
  const alignment = kit?.layout.textAlignment ?? "center";
  const tx = alignment === "left" ? padding : alignment === "right" ? boxWidth - padding : boxWidth / 2;
  const anchor = alignment === "left" ? "start" : alignment === "right" ? "end" : "middle";
  const quote = lines.map((line, index) => `<text x="${tx}" y="${padding + fontSize + index * fontSize * 1.4}" font-size="${fontSize}" font-family="${escape(kit?.typography.headingFont ?? "Georgia")}" font-weight="600">${escape(line.trimEnd())}</text>`).join("");
  const author = authors.map((line, index) => `<text x="${tx}" y="${padding + lines.length * fontSize * 1.4 + fontSize * 0.8 + index * fontSize * 0.85}" font-size="${fontSize * 0.6}" font-family="${escape(kit?.typography.bodyFont ?? "Arial")}">${escape(line.trimEnd())}</text>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${boxWidth}" height="${panelHeight}"><rect width="100%" height="100%" rx="16" fill="${kit?.colors.background ?? "#FFFFFF"}" fill-opacity="0.95"/><g fill="${kit?.colors.text ?? "#111827"}" text-anchor="${anchor}">${quote}${author}</g></svg>`;
  return sharp(bytes).composite([{ input: Buffer.from(svg), left, top }]).png().toBuffer();
}
