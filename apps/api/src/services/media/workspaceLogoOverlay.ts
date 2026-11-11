import sharp from "sharp";

export type LogoPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type LogoOverlayOptions = {
  position: LogoPosition;
  sizePercent: number;
  opacity: number;
};

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;

export class LogoOverlayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LogoOverlayError";
  }
}

/**
 * Pure image-processing utility.
 *
 * No database access, Supabase calls, OpenAI
 * requests, or credit-accounting operations.
 */
export async function applyWorkspaceLogoOverlay(
  imageBytes: Uint8Array,
  logoBytes: Uint8Array,
  options: LogoOverlayOptions,
): Promise<Buffer> {
  if (
    !(imageBytes instanceof Uint8Array) ||
    !(logoBytes instanceof Uint8Array) ||
    imageBytes.byteLength === 0 ||
    logoBytes.byteLength === 0 ||
    imageBytes.byteLength > MAX_BYTES ||
    logoBytes.byteLength > MAX_BYTES
  ) {
    throw new LogoOverlayError("Invalid image or logo bytes.");
  }

  if (
    !["top-left", "top-right", "bottom-left", "bottom-right"].includes(
      options.position,
    ) ||
    !Number.isFinite(options.sizePercent) ||
    options.sizePercent < 5 ||
    options.sizePercent > 30 ||
    !Number.isFinite(options.opacity) ||
    options.opacity < 0.1 ||
    options.opacity > 1
  ) {
    throw new LogoOverlayError("Invalid logo settings.");
  }

  const base = await sharp(imageBytes, {
    failOn: "error",
    limitInputPixels: MAX_PIXELS,
    animated: false,
  }).metadata();

  if (
    base.format !== "png" ||
    !base.width ||
    !base.height ||
    base.width * base.height > MAX_PIXELS ||
    (base.pages ?? 1) !== 1
  ) {
    throw new LogoOverlayError("Overlay requires a valid single-frame PNG.");
  }

  const logo = await sharp(logoBytes, {
    failOn: "error",
    limitInputPixels: MAX_PIXELS,
    animated: false,
  }).metadata();

  // Never interpret user-supplied SVG or animated
  // files during logo composition.
  if (
    !["png", "jpeg", "webp"].includes(logo.format ?? "") ||
    !logo.width ||
    !logo.height ||
    (logo.pages ?? 1) !== 1
  ) {
    throw new LogoOverlayError(
      "Logo must be a single-frame PNG, JPEG, or WebP.",
    );
  }

  const margin = Math.max(
    4,
    Math.round(Math.min(base.width, base.height) * 0.04),
  );

  const maxWidth = Math.max(
    1,
    Math.floor((base.width * options.sizePercent) / 100),
  );

  const maxHeight = Math.max(
    1,
    Math.floor((base.height * options.sizePercent) / 100),
  );

  const resized = await sharp(logoBytes, {
    failOn: "error",
    limitInputPixels: MAX_PIXELS,
    animated: false,
  })
    .rotate()
    .resize({
      width: maxWidth,
      height: maxHeight,
      fit: "inside",
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (resized.info.channels !== 4) {
    throw new LogoOverlayError("Unable to process logo transparency.");
  }

  // Modify alpha only; preserve RGB values.
  const raw = Buffer.from(resized.data);

  for (let i = 3; i < raw.length; i += 4) {
    raw[i] = Math.round(raw[i] * options.opacity);
  }

  const overlay = await sharp(raw, {
    raw: {
      width: resized.info.width,
      height: resized.info.height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();

  const left = options.position.endsWith("right")
    ? base.width - resized.info.width - margin
    : margin;

  const top = options.position.startsWith("bottom")
    ? base.height - resized.info.height - margin
    : margin;

  if (left < 0 || top < 0) {
    throw new LogoOverlayError("Logo cannot fit inside the generated image.");
  }

  const output = await sharp(imageBytes, {
    failOn: "error",
    limitInputPixels: MAX_PIXELS,
    animated: false,
  })
    .composite([
      {
        input: overlay,
        left,
        top,
        blend: "over",
      },
    ])
    .png()
    .toBuffer();

  if (output.length > MAX_BYTES) {
    throw new LogoOverlayError("Branded image exceeds the storage limit.");
  }

  return output;
}
