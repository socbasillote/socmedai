import {
  validateGeneratedImage,
  type ValidatedImage,
} from "./imageValidation.js";

import {
  parseWorkspaceLogoSettings,
  type WorkspaceLogoSettings,
} from "./workspaceLogoConfig.js";

import { downloadVerifiedWorkspaceLogo } from "./workspaceLogoStorage.js";

import { applyWorkspaceLogoOverlay } from "./workspaceLogoOverlay.js";

import type { ImageStorageBucket } from "./supabaseImageStorage.js";

export type PrepareBrandedImageInput = {
  workspaceId: string;
  bytes: Uint8Array;

  // Captured when the generation was admitted.
  // Undefined means a legacy, unbranded asset.
  snapshot?: WorkspaceLogoSettings | null;
};

/**
 * Converts generated image bytes into the exact
 * final PNG that Storm will checkpoint and store.
 *
 * No provider calls, database writes, or uploads.
 */
export async function prepareBrandedGeneratedImage(
  input: PrepareBrandedImageInput,
  bucket: ImageStorageBucket,
): Promise<ValidatedImage> {
  // Always validate and normalize provider output.
  const original = await validateGeneratedImage(input.bytes);

  // Legacy assets are unbranded.
  if (input.snapshot == null) {
    return original;
  }

  // Validate the persisted snapshot rather than
  // trusting a workspace setting at worker time.
  const settings = parseWorkspaceLogoSettings(
    input.snapshot,
    input.workspaceId,
  );

  if (!settings.enabled) {
    return original;
  }

  if (!settings.logo) {
    throw new Error("Enabled workspace branding has no logo.");
  }

  // The exact private logo version must match
  // the SHA-256 saved at admission time.
  const logoBytes = await downloadVerifiedWorkspaceLogo(
    {
      workspaceId: input.workspaceId,
      storageKey: settings.logo.storageKey,
      sha256: settings.logo.sha256,
    },
    bucket,
  );

  const brandedBytes = await applyWorkspaceLogoOverlay(
    original.bytes,
    logoBytes,
    {
      position: settings.position,
      sizePercent: settings.sizePercent,
      opacity: settings.opacity,
    },
  );

  // This is the final artifact.
  //
  // Its SHA-256, dimensions, and file size are
  // the metadata that must be checkpointed.
  return validateGeneratedImage(brandedBytes);
}
