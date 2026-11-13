import { apiFetch } from "@/lib/api";

export type WorkspaceLogoSettings = {
  enabled: boolean;
  logo: {
    storageKey: string;
    sha256: string;
  } | null;
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  sizePercent: number;
  opacity: number;
};

type WorkspaceLogoResponse = {
  logoOverlay: WorkspaceLogoSettings;
};

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function validateWorkspaceLogoFile(file: File): void {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Choose a PNG, JPEG, or WebP image.");
  }

  if (file.size === 0 || file.size > MAX_FILE_BYTES) {
    throw new Error("Logo must be larger than 0 bytes and at most 5 MB.");
  }
}

export async function getWorkspaceLogo(
  workspaceId: string,
): Promise<WorkspaceLogoSettings> {
  const response = await apiFetch<WorkspaceLogoResponse>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/logo`,
  );

  return response.logoOverlay;
}

export async function uploadWorkspaceLogo(
  workspaceId: string,
  file: File,
): Promise<WorkspaceLogoSettings> {
  validateWorkspaceLogoFile(file);

  // This endpoint expects raw file bytes.
  // Do NOT use FormData or JSON.stringify().
  const response = await apiFetch<WorkspaceLogoResponse>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/logo`,
    {
      method: "POST",
      headers: {
        "Content-Type": file.type,
      },
      body: file,
    },
  );

  return response.logoOverlay;
}

export async function enableWorkspaceLogo(
  workspaceId: string,
): Promise<WorkspaceLogoSettings> {
  const response = await apiFetch<WorkspaceLogoResponse>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/logo`,
    {
      method: "PATCH",
      body: JSON.stringify({
        enabled: true,
      }),
    },
  );

  return response.logoOverlay;
}
