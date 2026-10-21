import { apiFetch } from "@/lib/api";

type LinkedInConnectResponse = {
  authorizationUrl: string;
};

export async function startLinkedInConnect(
  workspaceId: string,
): Promise<string> {
  const normalizedWorkspaceId = workspaceId.trim();

  if (!normalizedWorkspaceId) {
    throw new Error("Select a workspace before connecting LinkedIn.");
  }

  const response = await apiFetch<LinkedInConnectResponse>(
    "/api/linkedin/connect",
    {
      method: "POST",
      body: JSON.stringify({
        workspaceId: normalizedWorkspaceId,
      }),
    },
  );

  if (
    typeof response.authorizationUrl !== "string" ||
    !response.authorizationUrl.startsWith(
      "https://www.linkedin.com/oauth/v2/authorization",
    )
  ) {
    throw new Error("The API returned an invalid LinkedIn authorization URL.");
  }

  return response.authorizationUrl;
}

export type LinkedInConnectionInfo = {
  id: string;
  workspaceId: string;
  linkedinMemberId: string;
  displayName?: string;
  profilePictureUrl?: string;
  tokenExpiresAt: string;
  status: "connected" | "expired" | "revoked";
};

export type LinkedInStatusResponse = {
  connected: boolean;
  connection: LinkedInConnectionInfo | null;
};

export async function getLinkedInStatus(
  workspaceId: string,
): Promise<LinkedInStatusResponse> {
  const normalizedWorkspaceId = workspaceId.trim();

  if (!normalizedWorkspaceId) {
    throw new Error("Select a workspace before checking LinkedIn status.");
  }

  const response = await apiFetch<LinkedInStatusResponse>(
    `/api/linkedin/status?workspaceId=${encodeURIComponent(normalizedWorkspaceId)}`,
  );

  return response;
}
