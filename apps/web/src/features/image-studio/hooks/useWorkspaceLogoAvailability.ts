import { useCallback, useEffect, useState } from "react";

import { getWorkspaces } from "@/lib/workspaces";
import { hasWorkspaceLogo } from "@/lib/workspaceLogoAvailability";

type LogoAvailability = "loading" | "available" | "unavailable" | "error";

export function useWorkspaceLogoAvailability(workspaceId: string | null) {
  const [refreshVersion, setRefreshVersion] = useState(0);

  const [result, setResult] = useState<{
    workspaceId: string | null;
    status: LogoAvailability;
  }>({
    workspaceId: null,
    status: "unavailable",
  });

  const refresh = useCallback(() => {
    setRefreshVersion((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!workspaceId) {
      return;
    }

    let active = true;

    setResult({
      workspaceId,
      status: "loading",
    });

    void getWorkspaces()
      .then((workspaces) => {
        if (!active) return;

        const selected = workspaces.find(
          (workspace) => workspace._id === workspaceId,
        );

        setResult({
          workspaceId,
          status:
            selected && hasWorkspaceLogo(selected)
              ? "available"
              : "unavailable",
        });
      })
      .catch(() => {
        if (!active) return;

        setResult({
          workspaceId,
          status: "error",
        });
      });

    return () => {
      active = false;
    };
  }, [workspaceId, refreshVersion]);

  const status: LogoAvailability = !workspaceId
    ? "unavailable"
    : result.workspaceId === workspaceId
      ? result.status
      : "loading";

  return {
    status,
    logoAvailable: status === "available",
    refresh,
  };
}
