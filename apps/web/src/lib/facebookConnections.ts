import { apiFetch } from "@/lib/api";

import type { FacebookPageConnectionOption } from "@/components/FacebookPageConnectionSelect";

type ConnectionRecord = {
  id?: string;
  _id?: string;
  facebookPageId?: string;
  pageName?: string;
  status?: string;
  canPublish?: boolean;
  tasks?: string[];
};

type ConnectionsResponse = {
  connections: ConnectionRecord[];
};

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

export async function getFacebookPageConnections(
  workspaceId: string,
): Promise<FacebookPageConnectionOption[]> {
  if (!OBJECT_ID.test(workspaceId)) {
    throw new Error("Select a valid workspace.");
  }

  const response = await apiFetch<ConnectionsResponse>(
    `/api/facebook/connections?workspaceId=${encodeURIComponent(workspaceId)}`,
  );

  if (!Array.isArray(response.connections)) {
    throw new Error("Invalid Facebook connections response.");
  }

  return response.connections.map((connection) => {
    const id = connection.id ?? connection._id;
    const status = connection.status;

    if (
      !id ||
      !OBJECT_ID.test(id) ||
      typeof connection.facebookPageId !== "string" ||
      !/^[0-9]+$/.test(connection.facebookPageId) ||
      typeof connection.pageName !== "string" ||
      !["connected", "expired", "revoked"].includes(status ?? "")
    ) {
      throw new Error("Invalid Facebook Page connection data.");
    }

    return {
      id,
      facebookPageId: connection.facebookPageId,
      pageName: connection.pageName,
      status: status as FacebookPageConnectionOption["status"],
      canPublish:
        connection.canPublish === true ||
        (Array.isArray(connection.tasks) &&
          connection.tasks.includes("CREATE_CONTENT")),
    };
  });
}
