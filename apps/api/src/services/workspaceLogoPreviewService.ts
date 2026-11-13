import { createClient } from "@supabase/supabase-js";

import { env } from "../config/env.js";

import { IMAGE_BUCKET } from "./media/supabaseImageStorage.js";

import {
  getWorkspaceLogoSettings,
  WorkspaceLogoServiceError,
} from "./workspaceLogoService.js";

import type { AuthenticatedUser } from "./userProfileService.js";

const LOGO_PREVIEW_EXPIRY_SECONDS = 60;

export type WorkspaceLogoPreviewSigner = {
  createSignedUrl(
    path: string,
    expiresIn: number,
  ): Promise<{
    data: { signedUrl: string } | null;
    error: { message: string } | null;
  }>;
};

function getWorkspaceLogoPreviewSigner(): WorkspaceLogoPreviewSigner {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new WorkspaceLogoServiceError(
      "Private media storage is not configured.",
      503,
    );
  }

  const supabase = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  return supabase.storage.from(IMAGE_BUCKET);
}

export async function createWorkspaceLogoPreview(
  authUser: AuthenticatedUser,
  workspaceId: string,
  signer?: WorkspaceLogoPreviewSigner,
): Promise<{
  url: string;
  expiresIn: number;
}> {
  // Authorization and ownership are enforced
  // before any signed URL is created.
  const settings = await getWorkspaceLogoSettings(authUser, workspaceId);

  if (!settings.logo) {
    throw new WorkspaceLogoServiceError(
      "Workspace logo is not available.",
      404,
    );
  }

  const storageKey = settings.logo.storageKey;

  const imageSigner = signer ?? getWorkspaceLogoPreviewSigner();

  try {
    const signed = await imageSigner.createSignedUrl(
      storageKey,
      LOGO_PREVIEW_EXPIRY_SECONDS,
    );

    if (signed.error || !signed.data?.signedUrl) {
      throw new Error("Signing failed.");
    }

    return {
      url: signed.data.signedUrl,
      expiresIn: LOGO_PREVIEW_EXPIRY_SECONDS,
    };
  } catch {
    throw new WorkspaceLogoServiceError(
      "Workspace logo preview is temporarily unavailable.",
      503,
    );
  }
}
