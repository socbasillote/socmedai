import { logoVariantSchema, type LogoVariant } from "../schemas/brandKitSchema.js";
import {
  getUserWorkspaceById,
  isValidWorkspaceId,
} from "./workspaceService.js";

import type { AuthenticatedUser } from "./userProfileService.js";

import {
  parseWorkspaceLogoSettings,
  type WorkspaceLogoSettings,
} from "./media/workspaceLogoConfig.js";

import Workspace from "../models/Workspace.js";

import { uploadWorkspaceLogo } from "./media/workspaceLogoStorage.js";

import {
  getPrivateImageBucket,
  type ImageStorageBucket,
} from "./media/supabaseImageStorage.js";

import type { UpdateWorkspaceLogoInput } from "../schemas/workspaceLogoUpdateSchema.js";

export class WorkspaceLogoServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "WorkspaceLogoServiceError";
  }
}

function logoPath(variant: LogoVariant): string {
  const selected = logoVariantSchema.parse(variant);
  return selected === "primary" ? "settings.logoOverlay" : `settings.brandKitLogoVariants.${selected}`;
}

function logoValue(settings: Record<string, unknown>, variant: LogoVariant): unknown {
  if (variant === "primary") return settings.logoOverlay;
  return (settings.brandKitLogoVariants as Record<string, unknown> | undefined)?.[variant];
}

export async function getWorkspaceLogoSettings(
  authUser: AuthenticatedUser,
  workspaceId: string,
  variant: LogoVariant = "primary",
): Promise<WorkspaceLogoSettings> {
  if (!isValidWorkspaceId(workspaceId)) {
    throw new WorkspaceLogoServiceError("Workspace not found.", 404);
  }

  // Existing service enforces ownerUserId
  // for the authenticated Supabase user.
  const workspace = await getUserWorkspaceById(authUser, workspaceId);

  if (!workspace) {
    throw new WorkspaceLogoServiceError("Workspace not found.", 404);
  }

  const settings =
    workspace.settings &&
    typeof workspace.settings === "object" &&
    !Array.isArray(workspace.settings)
      ? (workspace.settings as Record<string, unknown>)
      : {};

  logoPath(variant);
  return parseWorkspaceLogoSettings(logoValue(settings, variant), workspaceId);
}

export async function uploadUserWorkspaceLogo(
  authUser: AuthenticatedUser,
  workspaceId: string,
  bytes: Uint8Array,
  bucket: ImageStorageBucket = getPrivateImageBucket(),
  variant: LogoVariant = "primary",
): Promise<WorkspaceLogoSettings> {
  if (!isValidWorkspaceId(workspaceId)) {
    throw new WorkspaceLogoServiceError("Workspace not found.", 404);
  }

  // Authorization must happen before any
  // upload to private object storage.
  const workspace = await getUserWorkspaceById(authUser, workspaceId);

  if (!workspace) {
    throw new WorkspaceLogoServiceError("Workspace not found.", 404);
  }

  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength === 0 ||
    bytes.byteLength > 5 * 1024 * 1024
  ) {
    throw new WorkspaceLogoServiceError("Invalid logo file size.", 400);
  }

  const existingSettings =
    workspace.settings &&
    typeof workspace.settings === "object" &&
    !Array.isArray(workspace.settings)
      ? (workspace.settings as Record<string, unknown>)
      : {};

  const currentLogo = parseWorkspaceLogoSettings(
    logoValue(existingSettings, variant),
    workspaceId,
  );

  // The storage utility validates, normalizes,
  // uploads, and verifies the new private PNG.
  // Every upload creates an immutable version.
  const stored = await uploadWorkspaceLogo(
    {
      workspaceId,
      bytes,
    },
    bucket,
  );

  const updatedSettings = parseWorkspaceLogoSettings(
    {
      ...currentLogo,
      logo: {
        storageKey: stored.storageKey,
        sha256: stored.sha256,
      },
    },
    workspaceId,
  );

  // Recheck the original authorized owner.
  // Only change logoOverlay, not unrelated
  // workspace settings.
  const path = logoPath(variant);
  const originalOverlay = logoValue(existingSettings, variant);

  const guard =
    originalOverlay === undefined
      ? { [path]: { $exists: false } }
      : { [path]: originalOverlay };

  const updated = await Workspace.findOneAndUpdate(
    {
      _id: workspace._id,
      ownerUserId: workspace.ownerUserId,
      ...guard,
    },
    {
      $set: {
        [path]: updatedSettings,
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  if (!updated) {
    // The newly uploaded immutable object is
    // retained because storage has already
    // succeeded. Do not delete it blindly.
    throw new WorkspaceLogoServiceError(
      "Workspace logo settings changed during upload. " +
        "Refresh before uploading again.",
      409,
    );
  }

  return updatedSettings;
}

export async function updateUserWorkspaceLogoSettings(
  authUser: AuthenticatedUser,
  workspaceId: string,
  input: UpdateWorkspaceLogoInput,
  variant: LogoVariant = "primary",
): Promise<WorkspaceLogoSettings> {
  if (!isValidWorkspaceId(workspaceId)) {
    throw new WorkspaceLogoServiceError("Workspace not found.", 404);
  }

  const workspace = await getUserWorkspaceById(authUser, workspaceId);

  if (!workspace) {
    throw new WorkspaceLogoServiceError("Workspace not found.", 404);
  }

  const settings =
    workspace.settings &&
    typeof workspace.settings === "object" &&
    !Array.isArray(workspace.settings)
      ? (workspace.settings as Record<string, unknown>)
      : {};

  const previous = parseWorkspaceLogoSettings(
    logoValue(settings, variant),
    workspaceId,
  );

  const nextSettings = parseWorkspaceLogoSettings(
    { ...previous, ...input },
    workspaceId,
  );

  // Optimistic concurrency guard.
  // The original configuration must still match
  // what we read before updating it.
  const path = logoPath(variant);
  const originalOverlay = logoValue(settings, variant);

  const guard =
    originalOverlay === undefined
      ? { [path]: { $exists: false } }
      : { [path]: originalOverlay };

  const updated = await Workspace.findOneAndUpdate(
    {
      _id: workspace._id,
      ownerUserId: workspace.ownerUserId,
      ...guard,
    },
    {
      $set: {
        [path]: nextSettings,
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  if (!updated) {
    throw new WorkspaceLogoServiceError(
      "Workspace logo settings changed. Refresh and retry.",
      409,
    );
  }

  return nextSettings;
}
