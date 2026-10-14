const STORAGE_KEY = "storm";

export function readStoredWorkspaceId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage may be unavailable in restricted browser contexts.
    return null;
  }
}

export function storeWorkspaceId(workspaceId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, workspaceId);
  } catch {
    // The app should still work if browser storage is unavailable.
  }
}

export function clearStoredWorkspaceId(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures; selection can still work in memory.
  }
}
