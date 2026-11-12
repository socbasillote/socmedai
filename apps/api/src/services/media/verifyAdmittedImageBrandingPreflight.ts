import {
  resolveAdmittedImageBranding,
  type ResolveAdmittedImageBrandingInput,
} from "./resolveAdmittedImageBranding.js";

import { downloadVerifiedWorkspaceLogo } from "./workspaceLogoStorage.js";

import { planTextLabelLayout } from "./textLabelLayout.js";

import { imageAspectRatioSchema } from "../../schemas/aiImageSchema.js";

import type { ImageStorageBucket } from "./supabaseImageStorage.js";

/**
 * Dimensions currently implemented by:
 *
 * - MockImageProvider
 * - OpenAIImageProvider
 *
 * Both adapters must continue to verify these
 * dimensions when generating their images.
 */
const EXPECTED_DIMENSIONS = {
  square: {
    width: 1024,
    height: 1024,
  },

  portrait: {
    width: 1024,
    height: 1536,
  },

  landscape: {
    width: 1536,
    height: 1024,
  },
} as const;

export type VerifyAdmittedBrandingInput = ResolveAdmittedImageBrandingInput & {
  /**
   * Read directly from the claimed MediaAsset.
   *
   * Optional for compatibility with callers
   * that only verify legacy logo snapshots.
   *
   * Required when branding is text.
   */
  generation?: {
    provider: string;
    model: string;
    aspectRatio: string;
  };
};

function getExpectedDimensions(
  generation: VerifyAdmittedBrandingInput["generation"],
) {
  if (!generation) {
    throw new Error("Text branding requires persisted generation metadata.");
  }

  const aspectRatio = imageAspectRatioSchema.safeParse(generation.aspectRatio);

  if (!aspectRatio.success) {
    throw new Error("Unsupported text-branding aspect ratio.");
  }

  /**
   * Only accept the provider/model combinations
   * whose image dimensions we have inspected.
   *
   * Do not assume unknown providers or models
   * return these dimensions.
   */
  const supportedMock =
    generation.provider === "mock" &&
    generation.model === "storm-mock-image-v1";

  const supportedOpenAI =
    generation.provider === "openai" && generation.model === "gpt-image-2";

  if (!supportedMock && !supportedOpenAI) {
    throw new Error("Text branding requires a supported image provider.");
  }

  return EXPECTED_DIMENSIONS[aspectRatio.data];
}

/**
 * Check whether a text label can fit the expected
 * dimensions of an admitted generation.
 *
 * Shared by:
 * - credit-aware admission
 * - worker preflight
 *
 * No database access, storage access, or
 * provider execution.
 */
export function validateTextBrandingLayout(
  branding: {
    text: string;
    sizePercent: number;
  },
  generation: NonNullable<VerifyAdmittedBrandingInput["generation"]>,
): void {
  const dimensions = getExpectedDimensions(generation);

  planTextLabelLayout({
    text: branding.text,
    imageWidth: dimensions.width,
    imageHeight: dimensions.height,
    sizePercent: branding.sizePercent,
  });
}

/**
 * Validate the admitted branding before
 * crossing the provider_started boundary.
 *
 * No provider calls, database writes,
 * credit deductions, or image uploads.
 */
export async function verifyAdmittedImageBrandingPreflight(
  input: VerifyAdmittedBrandingInput,
  bucket: ImageStorageBucket,
): Promise<void> {
  const branding = resolveAdmittedImageBranding(input);

  /**
   * MODE 1: No branding.
   */
  if (branding.type === "none") {
    return;
  }

  /**
   * MODE 2: Text branding.
   *
   * Verify that the admitted text can fit the
   * dimensions expected from this exact
   * provider/model/aspect-ratio combination.
   */
  if (branding.type === "text") {
    if (!input.generation) {
      throw new Error("Text branding requires persisted generation metadata.");
    }

    validateTextBrandingLayout(branding, input.generation);

    return;
  }

  /**
   * MODE 3: Workspace logo.
   *
   * Verify the exact private object captured
   * during admission.
   */
  await downloadVerifiedWorkspaceLogo(
    {
      workspaceId: input.workspaceId,
      storageKey: branding.logo.storageKey,
      sha256: branding.logo.sha256,
    },
    bucket,
  );
}
