import { z } from "zod";

import {
  parseWorkspaceLogoSettings,
  type WorkspaceLogoSettings,
} from "./workspaceLogoConfig.js";

const positionSchema = z.enum([
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
]);

const appearanceSchema = {
  position: positionSchema,
  sizePercent: z.number().int().min(5).max(30),
  opacity: z.number().min(0.1).max(1),
};

const logoSchema = z
  .object({
    storageKey: z.string().min(1).max(1024),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const admittedBrandingSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("none"),
    })
    .strict(),

  z
    .object({
      type: z.literal("logo"),
      logo: logoSchema,
      ...appearanceSchema,
    })
    .strict(),

  z
    .object({
      type: z.literal("text"),
      text: z
        .string()
        .trim()
        .min(1)
        .max(80)
        .refine(
          (value) => !/[\u0000-\u001f\u007f]/u.test(value),
          "Text labels cannot contain control characters.",
        ),
      ...appearanceSchema,
    })
    .strict(),
]);

export type AdmittedImageBranding = z.infer<typeof admittedBrandingSchema>;

export type ResolveAdmittedImageBrandingInput = {
  workspaceId: string;

  /**
   * New per-image snapshot.
   */
  brandingSnapshot?: unknown;

  /**
   * Original logo snapshot.
   *
   * Required for compatibility with images
   * admitted before the new branding format.
   */
  logoOverlaySnapshot?: unknown;
};

function sameLogoSettings(
  branding: Extract<AdmittedImageBranding, { type: "logo" }>,
  legacy: WorkspaceLogoSettings,
): boolean {
  return (
    legacy.enabled &&
    legacy.logo != null &&
    legacy.logo.storageKey === branding.logo.storageKey &&
    legacy.logo.sha256 === branding.logo.sha256 &&
    legacy.position === branding.position &&
    legacy.sizePercent === branding.sizePercent &&
    legacy.opacity === branding.opacity
  );
}

/**
 * Resolve immutable branding from a persisted
 * MediaAsset.
 *
 * A new brandingSnapshot takes precedence,
 * but a legacy logo snapshot must not contradict it.
 *
 * No database access, uploads, or provider calls.
 */
export function resolveAdmittedImageBranding(
  input: ResolveAdmittedImageBrandingInput,
): AdmittedImageBranding {
  const legacy =
    input.logoOverlaySnapshot == null
      ? null
      : parseWorkspaceLogoSettings(
          input.logoOverlaySnapshot,
          input.workspaceId,
        );

  // Assets created before brandingSnapshot existed.
  if (input.brandingSnapshot == null) {
    if (!legacy || !legacy.enabled) {
      return { type: "none" };
    }

    if (!legacy.logo) {
      throw new Error("Legacy logo snapshot is incomplete.");
    }

    return {
      type: "logo",
      logo: {
        storageKey: legacy.logo.storageKey,
        sha256: legacy.logo.sha256,
      },
      position: legacy.position,
      sizePercent: legacy.sizePercent,
      opacity: legacy.opacity,
    };
  }

  const branding = admittedBrandingSchema.parse(input.brandingSnapshot);

  // Even if the new snapshot is valid, the
  // old one must not disagree with it.
  if (branding.type === "none") {
    if (legacy?.enabled) {
      throw new Error("Conflicting admitted branding snapshots.");
    }

    return branding;
  }

  if (branding.type === "text") {
    if (legacy?.enabled) {
      throw new Error("Text branding conflicts with an enabled logo.");
    }

    return branding;
  }

  // Ensure the exact logo belongs to this asset's
  // workspace, not another workspace.
  const expectedPattern = new RegExp(
    `^workspaces/${input.workspaceId.toLowerCase()}/logos/[a-f0-9]{24}\\.png$`,
  );

  if (!expectedPattern.test(branding.logo.storageKey)) {
    throw new Error("Branding logo does not belong to the asset workspace.");
  }

  if (legacy && !sameLogoSettings(branding, legacy)) {
    throw new Error("Conflicting admitted branding snapshots.");
  }

  return branding;
}
