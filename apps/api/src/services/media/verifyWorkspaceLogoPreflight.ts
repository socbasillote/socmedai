import {
  parseWorkspaceLogoSettings,
  type WorkspaceLogoSettings,
} from "./workspaceLogoConfig.js";

import { downloadVerifiedWorkspaceLogo } from "./workspaceLogoStorage.js";

import type { ImageStorageBucket } from "./supabaseImageStorage.js";

export type VerifyWorkspaceLogoPreflightInput = {
  workspaceId: string;
  snapshot?: WorkspaceLogoSettings | null;
};

/**
 * Check that the exact logo captured at admission
 * remains available and has the expected SHA-256.
 *
 * This function has no database writes, no uploads,
 * and no paid provider calls.
 */
export async function verifyWorkspaceLogoPreflight(
  input: VerifyWorkspaceLogoPreflightInput,
  bucket: ImageStorageBucket,
): Promise<void> {
  // Legacy assets do not have a logo snapshot.
  if (input.snapshot == null) {
    return;
  }

  const settings = parseWorkspaceLogoSettings(
    input.snapshot,
    input.workspaceId,
  );

  if (!settings.enabled) {
    return;
  }

  if (!settings.logo) {
    throw new Error("Enabled workspace branding requires a logo.");
  }

  await downloadVerifiedWorkspaceLogo(
    {
      workspaceId: input.workspaceId,
      storageKey: settings.logo.storageKey,
      sha256: settings.logo.sha256,
    },
    bucket,
  );
}
