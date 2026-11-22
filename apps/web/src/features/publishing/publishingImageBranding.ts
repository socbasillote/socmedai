import { validateImageBranding, type GenerateImageCommand, type ImageBrandingMode, type ImageBrandingPosition } from "@/lib/imageGeneration";

export type PublishingImageBranding = NonNullable<GenerateImageCommand["image"]["branding"]>;

/**
 * Converts editable branding settings into the exact
 * payload expected by the existing generation API.
 *
 * Throws before any POST if the settings are invalid.
 */
export function createPublishingImageBranding(
  settings: PublishingBrandingSettings,
  logoVerified: boolean,
): PublishingImageBranding {
  const error = validatePublishingBrandingSettings(settings, logoVerified);

  if (error) {
    throw new Error(error);
  }

  if (settings.mode === "none") {
    return { type: "none" };
  }

  const appearance = {
    position: settings.position,
    sizePercent: settings.sizePercent,
    opacity: settings.opacityPercent / 100,
  };

  if (settings.mode === "logo") {
    return {
      type: "logo",
      ...appearance,
    };
  }

  return {
    type: "text",
    text: settings.text,
    ...appearance,
  };
}

export type PublishingBrandingSettings = {
  mode: ImageBrandingMode;
  text: string;
  position: ImageBrandingPosition;
  sizePercent: number;
  opacityPercent: number;
};

export const DEFAULT_PUBLISHING_BRANDING: PublishingBrandingSettings = {
  mode: "none",
  text: "",
  position: "bottom-right",
  sizePercent: 20,
  opacityPercent: 80,
};

export function validatePublishingBrandingSettings(
  settings: PublishingBrandingSettings,
  logoAvailable: boolean,
): string | null {
  if (settings.mode === "none") {
    return null;
  }

  if (settings.mode === "logo" && !logoAvailable) {
    return "An enabled workspace logo is required.";
  }

  try {
    const appearance = {
      position: settings.position,
      sizePercent: settings.sizePercent,
      opacity: settings.opacityPercent / 100,
    };

    if (settings.mode === "logo") {
      validateImageBranding({
        type: "logo",
        ...appearance,
      });
    } else {
      validateImageBranding({
        type: "text",
        text: settings.text,
        ...appearance,
      });
    }

    return null;
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "Invalid image branding settings.";
  }
}

