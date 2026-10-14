import { apiFetch } from "@/lib/api";

export type Workspace = {
  _id: string;
  name: string;
  ownerUserId: string;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type WorkspaceListResponse = {
  workspaces: Workspace[];
};

type WorkspaceCreateResponse = {
  workspace: Workspace;
};

export async function getWorkspaces(): Promise<Workspace[]> {
  const response = await apiFetch<WorkspaceListResponse>("/api/workspaces");

  return response.workspaces;
}

export async function createWorkspace(name: string): Promise<Workspace> {
  const response = await apiFetch<WorkspaceCreateResponse>("/api/workspaces", {
    method: "POST",
    body: JSON.stringify({ name }),
  });

  return response.workspace;
}
