import type { PostPlatform } from "@/lib/posts";

export const cropFormats = {
  square: { label: "Square (1:1)", width: 1080, height: 1080 },
  portrait: { label: "Portrait (4:5)", width: 1080, height: 1350 },
  landscape: { label: "Landscape (1.91:1)", width: 1200, height: 630 },
} as const;
export type CropSettings = { format: keyof typeof cropFormats; x: number; y: number; zoom: number };
export function defaultCrop(platform: PostPlatform): CropSettings {
  return { format: platform === "instagram" ? "portrait" : platform === "linkedin" ? "landscape" : "square", x: 50, y: 50, zoom: 1 };
}
export function cropRectangle(width: number, height: number, settings: CropSettings) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 ||
      !Number.isFinite(settings.x) || !Number.isFinite(settings.y) || !Number.isFinite(settings.zoom) || settings.zoom < 1 || settings.zoom > 3 || settings.x < 0 || settings.x > 100 || settings.y < 0 || settings.y > 100) throw new Error("Invalid crop settings.");
  const target = cropFormats[settings.format];
  if (!target) throw new Error("Choose a crop format.");
  const ratio = target.width / target.height;
  const cropWidth = Math.min(width, height * ratio) / settings.zoom;
  const cropHeight = cropWidth / ratio;
  return { x: (width - cropWidth) * settings.x / 100, y: (height - cropHeight) * settings.y / 100, width: cropWidth, height: cropHeight };
}
export function drawImageCrop(canvas: HTMLCanvasElement, image: ImageBitmap, settings: CropSettings) {
  const target = cropFormats[settings.format];
  const rect = cropRectangle(image.width, image.height, settings);
  canvas.width = target.width; canvas.height = target.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser could not prepare the crop preview.");
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
  context.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, target.width, target.height);
}
export function cropFile(canvas: HTMLCanvasElement, platform: PostPlatform): Promise<File> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (!blob) { reject(new Error("Could not create the cropped image.")); return; }
    resolve(new File([blob], `${platform}-crop.png`, { type: "image/png" }));
  }, "image/png"));
}
