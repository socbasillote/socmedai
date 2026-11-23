import { brandFontFamily, readableTextColor, type BrandKit } from "@/lib/brandKit";
import type { TemplateDraft } from "./templates";

export const templateSizes = { square: [1080, 1080], portrait: [1080, 1350], landscape: [1200, 630] } as const;
export function wrapTemplateText(context: Pick<CanvasRenderingContext2D, "measureText">, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (context.measureText(candidate).width <= width) { line = candidate; continue; }
      if (line) { lines.push(line); line = ""; }
      // Split long URLs and words rather than letting them escape their slot.
      for (const char of Array.from(word)) {
        if (context.measureText(line + char).width > width && line) { lines.push(line); line = ""; }
        line += char;
      }
    }
    lines.push(line);
  }
  return lines;
}
function text(context: CanvasRenderingContext2D, value: string, x: number, y: number, width: number, height: number, font: string, maxSize: number, color: string, align: CanvasTextAlign = "left") {
  if (!value.trim()) return;
  let size = maxSize;
  let lines: string[] = [];
  for (; size >= 16; size -= 2) {
    context.font = `600 ${size}px ${font}`;
    lines = wrapTemplateText(context, value.trim(), width);
    if (lines.length * size * 1.25 <= height) break;
  }
  if (size < 16) throw new Error("This text does not fit the design. Shorten it or choose another size.");
  context.fillStyle = color; context.textAlign = align; context.textBaseline = "top";
  lines.forEach((line, index) => context.fillText(line, x + (align === "center" ? width / 2 : align === "right" ? width : 0), y + index * size * 1.25));
}
function photo(context: CanvasRenderingContext2D, image: ImageBitmap, x: number, y: number, width: number, height: number, cover = false) {
  const scale = (cover ? Math.max : Math.min)(width / image.width, height / image.height);
  context.save(); context.beginPath(); context.rect(x, y, width, height); context.clip();
  context.drawImage(image, x + (width - image.width * scale) / 2, y + (height - image.height * scale) / 2, image.width * scale, image.height * scale);
  context.restore();
}
export async function renderTemplate(draft: TemplateDraft, kit?: BrandKit, images: { photo?: ImageBitmap; background?: ImageBitmap; logo?: ImageBitmap } = {}): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const [w, h] = templateSizes[draft.format]; canvas.width = w; canvas.height = h;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser could not render this design.");
  const colors = (kit ? { ...kit.colors, text: readableTextColor(kit.colors.background) } : undefined) ?? (draft.templateId === "sale"
    ? { primary: "#FBBF24", accent: "#FBBF24", background: "#2E1065", text: "#FFFFFF" }
    : { primary: "#5B21B6", accent: "#FBBF24", background: "#FFFFFF", text: "#111827" });
  const heading = kit ? brandFontFamily(kit.typography.headingFont) : "Georgia, serif";
  const body = kit ? brandFontFamily(kit.typography.bodyFont) : "Arial, sans-serif";
  const margin = kit?.layout.spacing === "compact" ? 48 : kit?.layout.spacing === "spacious" ? 80 : 64;
  const align = kit?.layout.textAlignment ?? "left";
  context.fillStyle = colors.background; context.fillRect(0, 0, w, h);
  if (images.background) { context.globalAlpha = draft.templateId === "custom" ? 1 : 0.2; photo(context, images.background, 0, 0, w, h, true); context.globalAlpha = 1; }
  const x = margin, y = 130, usableH = h - y - 130, usableW = w - margin * 2;
  const v = draft.values;
  if (draft.templateId === "quote") {
    const tw = images.photo ? usableW * 0.52 : usableW;
    context.fillStyle = colors.primary; context.fillRect(x, y, 64, 8);
    text(context, v.quote ?? "", x, y + 40, tw, usableH - 110, heading, 72, colors.text, align);
    text(context, v.author ?? "", x, y + usableH - 55, tw, 55, body, 30, colors.primary, align);
    if (images.photo) photo(context, images.photo, x + usableW * 0.6, y, usableW * 0.4, usableH, true);
  } else if (draft.templateId === "product") {
    if (images.photo) { context.save(); context.shadowColor = "#00000022"; context.shadowBlur = 28; context.shadowOffsetY = 16; photo(context, images.photo, x, y, usableW, usableH * 0.6); context.restore(); }
    text(context, v.name ?? "", x, y + usableH * 0.65, usableW, usableH * 0.19, heading, 62, colors.text, "center");
    text(context, v.tagline ?? "", x, y + usableH * 0.86, usableW, usableH * 0.14, body, 30, colors.primary, "center");
  } else if (draft.templateId === "sale") {
    const tw = images.photo ? usableW * 0.54 : usableW;
    context.fillStyle = colors.primary; context.fillRect(x, y, 80, 10);
    text(context, v.headline ?? "", x, y + 32, tw, usableH * 0.53, heading, 88, colors.text, align);
    text(context, v.price ?? "", x, y + usableH * 0.6, tw, usableH * 0.17, body, 54, colors.primary, align);
    text(context, v.cta ?? "", x, y + usableH * 0.84, tw, usableH * 0.16, body, 32, colors.text, align);
    if (images.photo) photo(context, images.photo, x + usableW * 0.6, y, usableW * 0.4, usableH);
  } else if (draft.templateId === "event") {
    const tw = images.photo ? usableW * 0.55 : usableW;
    text(context, v.name ?? "", x, y, tw, usableH * 0.43, heading, 76, colors.text, align);
    const date = v.date ? new Date(`${v.date}T12:00:00Z`).toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";
    text(context, date, x, y + usableH * 0.47, tw, usableH * 0.18, body, 44, colors.primary, align);
    text(context, v.venue ?? "", x, y + usableH * 0.7, tw, usableH * 0.13, body, 30, colors.text, align);
    text(context, v.cta ?? "", x, y + usableH * 0.87, tw, usableH * 0.13, body, 28, colors.primary, align);
    if (images.photo) photo(context, images.photo, x + usableW * 0.62, y, usableW * 0.38, usableH, true);
  } else {
    if (images.photo) photo(context, images.photo, x + usableW * 0.6, y, usableW * 0.4, usableH);
    if (v.headline || v.tagline) {
      context.fillStyle = colors.background; context.globalAlpha = 0.94;
      context.fillRect(x - 16, y - 16, images.photo ? usableW * 0.56 : usableW + 32, usableH + 32); context.globalAlpha = 1;
      const tw = images.photo ? usableW * 0.5 : usableW;
      text(context, v.headline ?? "", x, y + 20, tw, usableH * 0.65, heading, 80, colors.text, align);
      text(context, v.tagline ?? "", x, y + usableH * 0.74, tw, usableH * 0.25, body, 32, colors.primary, align);
    }
  }
  if (images.logo && kit) {
    const width = 140, height = 68;
    const px = kit.layout.logoPosition.endsWith("right") ? w - margin - width : margin;
    const py = kit.layout.logoPosition.startsWith("top") ? 32 : h - 96;
    photo(context, images.logo, px, py, width, height);
  }
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not export the design.")), "image/png"));
}
