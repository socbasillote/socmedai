import mongoose from "mongoose";
import { z } from "zod";

export const workspaceLogoPositionSchema = z.enum([
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
]);

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/);

export const workspaceLogoSettingsSchema = z
  .object({
    enabled: z.boolean(),
    logo: z
      .object({
        storageKey: z.string().min(1).max(1024),
        sha256: sha256Schema,
      })
      .nullable(),
    position: workspaceLogoPositionSchema,
    sizePercent: z.number().int().min(5).max(30),
    opacity: z.number().min(0.1).max(1),
  })
  .strict();

export type WorkspaceLogoSettings = z.infer<typeof workspaceLogoSettingsSchema>;

export const DEFAULT_WORKSPACE_LOGO_SETTINGS: WorkspaceLogoSettings = {
  enabled: false,
  logo: null,
  position: "bottom-right",
  sizePercent: 20,
  opacity: 0.8,
};

export function getWorkspaceLogoStorageKey(
  workspaceId: string,
  logoId: string,
): string {
  const workspace = objectIdSchema.parse(workspaceId.toLowerCase());
  const logo = objectIdSchema.parse(logoId.toLowerCase());

  return `workspaces/${workspace}/logos/${logo}.png`;
}

export function parseWorkspaceLogoSettings(
  value: unknown,
  workspaceId: string,
): WorkspaceLogoSettings {
  if (!mongoose.isObjectIdOrHexString(workspaceId)) {
    throw new Error("Invalid workspace ID.");
  }

  const settings = workspaceLogoSettingsSchema.parse(
    value ?? DEFAULT_WORKSPACE_LOGO_SETTINGS,
  );

  if (settings.enabled && !settings.logo) {
    throw new Error("Enabled logo overlay requires an uploaded logo.");
  }

  if (settings.logo) {
    const prefix = `workspaces/${workspaceId.toLowerCase()}/logos/`;

    const expected = new RegExp(`^${prefix}[a-f0-9]{24}\\.png$`);

    if (!expected.test(settings.logo.storageKey)) {
      throw new Error("Logo does not belong to this workspace.");
    }
  }

  return settings;
}

/**
 * Return a deep value-copy suitable for persisting
 * on the admitted image operation.
 *
 * Call this at admission time, not at completion.
 */
export function snapshotWorkspaceLogoSettings(
  value: unknown,
  workspaceId: string,
): WorkspaceLogoSettings {
  return structuredClone(parseWorkspaceLogoSettings(value, workspaceId));
}
