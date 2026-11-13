import type { GenerateImageCommand, ImageBranding } from "./imageGeneration";

function snapshotBranding(
  branding: ImageBranding | undefined,
): ImageBranding | undefined {
  if (!branding) {
    return undefined;
  }

  if (branding.type === "none") {
    return Object.freeze({
      type: "none" as const,
    });
  }

  const appearance = {
    position: branding.position,
    sizePercent: branding.sizePercent,
    opacity: branding.opacity,
  };

  if (branding.type === "logo") {
    return Object.freeze({
      type: "logo" as const,
      ...appearance,
    });
  }

  return Object.freeze({
    type: "text" as const,
    text: branding.text,
    ...appearance,
  });
}

/**
 * Capture an independent, immutable snapshot
 * of one logical image-generation request.
 *
 * The same snapshot must be used for every
 * retry of an ambiguous submission.
 */
export function snapshotImageGenerationCommand(
  command: GenerateImageCommand,
): GenerateImageCommand {
  const branding = snapshotBranding(command.image.branding);

  const image = Object.freeze({
    prompt: command.image.prompt,
    aspectRatio: command.image.aspectRatio,
    ...(branding ? { branding } : {}),
  });

  return Object.freeze({
    idempotencyKey: command.idempotencyKey,
    image,
  });
}
