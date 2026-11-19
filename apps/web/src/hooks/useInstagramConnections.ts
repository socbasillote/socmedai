import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
export type InstagramConnectionInfo = { id: string; username: string; instagramUserId: string; status: "connected" | "revoked"; canPublish: boolean };
type State = { workspaceId: string; connections: InstagramConnectionInfo[]; loading: boolean; error: string };
export function useInstagramConnections(workspaceId: string, enabled: boolean) {
  const [state, setState] = useState<State>({ workspaceId: "", connections: [], loading: false, error: "" });
  const generation = useRef(0);
  useEffect(() => {
    const revision = ++generation.current;
    if (!workspaceId || !enabled) return;
    setState({ workspaceId, connections: [], loading: true, error: "" });
    void apiFetch<{ connections: InstagramConnectionInfo[] }>(`/api/instagram/connections?${new URLSearchParams({ workspaceId })}`, { method: "GET", cache: "no-store" })
      .then(({ connections }) => { if (revision === generation.current) setState({ workspaceId, connections, loading: false, error: "" }); })
      .catch(() => { if (revision === generation.current) setState({ workspaceId, connections: [], loading: false, error: "Unable to load Instagram accounts." }); });
    return () => { generation.current++; };
  }, [workspaceId, enabled]);
  async function connect(facebookConnectionId: string) {
    const revision = ++generation.current;
    setState((previous) => ({ ...previous, workspaceId, loading: true, error: "" }));
    try {
      const { connections } = await apiFetch<{ connections: InstagramConnectionInfo[] }>("/api/instagram/connections", { method: "POST", body: JSON.stringify({ workspaceId, facebookConnectionId }) });
      if (revision === generation.current) setState({ workspaceId, connections, loading: false, error: "" });
    } catch (error) {
      if (revision === generation.current) setState({ workspaceId, connections: [], loading: false, error: error instanceof Error ? error.message : "Unable to connect Instagram." });
    }
  }
  return { connections: state.workspaceId === workspaceId && enabled ? state.connections : [], loading: enabled && (state.workspaceId !== workspaceId || state.loading), error: state.workspaceId === workspaceId ? state.error : "", connect };
}
