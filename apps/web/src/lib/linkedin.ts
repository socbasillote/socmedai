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
