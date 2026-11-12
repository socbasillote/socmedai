import {
  validateGeneratedImage,
  type ValidatedImage,
} from "./imageValidation.js";

import type { WorkspaceLogoSettings } from "./workspaceLogoConfig.js";

import {
  resolveAdmittedImageBranding,
  type AdmittedImageBranding,
} from "./resolveAdmittedImageBranding.js";

import { downloadVerifiedWorkspaceLogo } from "./workspaceLogoStorage.js";

import { applyWorkspaceLogoOverlay } from "./workspaceLogoOverlay.js";

import { applyTextLabelOverlay } from "./textLabelOverlay.js";

import type { ImageStorageBucket } from "./supabaseImageStorage.js";

export type PrepareBrandedImageInput = {
  workspaceId: string;
  bytes: Uint8Array;

  /**
   * Legacy logo snapshot.
   *
   * Kept for assets admitted before the new
   * per-image branding format existed.
   */
  snapshot?: WorkspaceLogoSettings | null;

  /**
   * New immutable per-image branding snapshot.
   */
  brandingSnapshot?: AdmittedImageBranding | null;
};

/**
 * Build the final image from the branding
 * instructions persisted at admission.
 *
 * No provider calls, database writes,
 * credit deductions, or uploads.
 */
export async function prepareBrandedGeneratedImage(
  input: PrepareBrandedImageInput,
  bucket: ImageStorageBucket,
): Promise<ValidatedImage> {
  // Normalize the provider response first.
  const original = await validateGeneratedImage(input.bytes);

  // Use exactly the same branding resolver
  // as the worker's preflight operation.
  const branding = resolveAdmittedImageBranding({
    workspaceId: input.workspaceId,

    brandingSnapshot: input.brandingSnapshot ?? null,

    logoOverlaySnapshot: input.snapshot ?? null,
  });

  /**
   * MODE 1: No branding
   */
  if (branding.type === "none") {
    return original;
  }

  /**
   * MODE 2: Text label
   *
   * The text, position, size and opacity
   * come exclusively from the admitted asset.
   */
  if (branding.type === "text") {
    const labeledBytes = await applyTextLabelOverlay(original.bytes, branding);

    return validateGeneratedImage(labeledBytes);
  }

  /**
   * MODE 3: Workspace logo
   *
   * Verify the exact private logo object and
   * SHA-256 saved when admission occurred.
   */
  const logoBytes = await downloadVerifiedWorkspaceLogo(
    {
      workspaceId: input.workspaceId,
      storageKey: branding.logo.storageKey,
      sha256: branding.logo.sha256,
    },
    bucket,
  );

  const brandedBytes = await applyWorkspaceLogoOverlay(
    original.bytes,
    logoBytes,
    {
      position: branding.position,
      sizePercent: branding.sizePercent,
      opacity: branding.opacity,
    },
  );

  // The final PNG bytes determine the
  // durable content checksum.
  return validateGeneratedImage(brandedBytes);
}
