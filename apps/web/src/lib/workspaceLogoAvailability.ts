import type { Workspace } from "./workspaces";

const SHA256_PATTERN = /^[a-fA-F0-9]{64}$/;
const OBJECT_ID_PATTERN = /^[a-fA-F0-9]{24}$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

/**
 * Checks whether workspace metadata indicates
 * that an enabled logo has been configured.
 *
 * This is UI guidance only.
 *
 * The backend remains responsible for validating
 * workspace ownership, the actual private logo
 * object, and its checksum.
 */
export function hasWorkspaceLogo(workspace: Workspace): boolean {
  if (!OBJECT_ID_PATTERN.test(workspace._id)) {
    return false;
  }

  const settings = asRecord(workspace.settings);
  const overlay = asRecord(settings?.logoOverlay);
  const logo = asRecord(overlay?.logo);

  if (!overlay || overlay.enabled !== true || !logo) {
    return false;
  }

  const storageKey = logo.storageKey;
  const sha256 = logo.sha256;

  if (
    typeof storageKey !== "string" ||
    typeof sha256 !== "string" ||
    !SHA256_PATTERN.test(sha256)
  ) {
    return false;
  }

  const expectedPrefix = `workspaces/${workspace._id.toLowerCase()}/logos/`;

  return (
    storageKey.startsWith(expectedPrefix) &&
    /^workspaces\/[a-f0-9]{24}\/logos\/[a-f0-9]{24}\.png$/.test(storageKey)
  );
}
