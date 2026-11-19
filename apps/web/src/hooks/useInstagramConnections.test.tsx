import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
import { apiFetch } from "@/lib/api";
import { useInstagramConnections } from "./useInstagramConnections";
beforeEach(() => { vi.resetAllMocks(); });
afterEach(cleanup);
it("does not load accounts while Instagram is inactive", () => {
 renderHook(() => useInstagramConnections("workspace", false));
 expect(apiFetch).not.toHaveBeenCalled();
});
it("discards stale account discovery after a workspace switch", async () => {
 let resolve!: (value: unknown) => void;
 vi.mocked(apiFetch).mockImplementationOnce(() => new Promise((done) => { resolve = done; })).mockResolvedValueOnce({ connections: [{ id: "new", username: "new" }] });
 const { result, rerender } = renderHook(({ workspace }) => useInstagramConnections(workspace, true), { initialProps: { workspace: "a" } });
 rerender({ workspace: "b" });
 await waitFor(() => expect(result.current.connections[0]?.id).toBe("new"));
 await act(async () => { resolve({ connections: [{ id: "old", username: "old" }] }); });
 expect(result.current.connections[0]?.id).toBe("new");
});
it("connects only the explicitly selected saved Page", async () => {
 vi.mocked(apiFetch).mockResolvedValueOnce({ connections: [] }).mockResolvedValueOnce({ connections: [{ id: "ig", username: "studio" }] });
 const { result } = renderHook(() => useInstagramConnections("workspace", true));
 await waitFor(() => expect(result.current.loading).toBe(false));
 await act(async () => { await result.current.connect("page"); });
 expect(apiFetch).toHaveBeenLastCalledWith("/api/instagram/connections", { method: "POST", body: JSON.stringify({ workspaceId: "workspace", facebookConnectionId: "page" }) });
 expect(result.current.connections[0]?.id).toBe("ig");
});
