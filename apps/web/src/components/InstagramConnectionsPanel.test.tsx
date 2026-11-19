import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InstagramConnectionsPanel } from "./InstagramConnectionsPanel";
const mocks = vi.hoisted(() => ({ connections: [] as Array<{ id: string; username: string; status: string; canPublish: boolean }>, loading: false, error: "", connect: vi.fn() }));
vi.mock("@/hooks/useInstagramConnections", () => ({ useInstagramConnections: () => mocks }));
const pages = [{ id: "page", facebookPageId: "123", pageName: "Studio Page", status: "connected" as const, canPublish: true }, { id: "revoked", facebookPageId: "999", pageName: "Revoked Page", status: "revoked" as const }];
const props = { workspaceId: "workspace", workspacesLoading: false, pages, pagesLoading: false, pagesError: "", facebookConnecting: false, onReconnectFacebook: vi.fn() };
beforeEach(() => { vi.clearAllMocks(); mocks.connections = []; mocks.loading = false; mocks.error = ""; });
afterEach(cleanup);
it("connects only the explicitly selected active Page", () => {
 render(<InstagramConnectionsPanel {...props} />);
 const connect = screen.getByRole("button", { name: "Connect or refresh Instagram" });
 expect(connect).toBeDisabled(); expect(screen.queryByRole("option", { name: "Revoked Page" })).not.toBeInTheDocument();
 fireEvent.change(screen.getByRole("combobox", { name: "Facebook Page for Instagram" }), { target: { value: "page" } });
 fireEvent.click(connect); expect(mocks.connect).toHaveBeenCalledWith("page");
});
it("shows connected accounts and accounts needing reconnection", () => {
 mocks.connections = [{ id: "ig", username: "studio", status: "connected", canPublish: true }, { id: "old", username: "old", status: "revoked", canPublish: false }];
 render(<InstagramConnectionsPanel {...props} />);
 expect(screen.getByText("@studio")).toBeInTheDocument(); expect(screen.getByText("Connected")).toBeInTheDocument();
 expect(screen.getByText("Reconnect required")).toBeInTheDocument();
});
it("clears Page selection when the workspace changes", () => {
 const { rerender } = render(<InstagramConnectionsPanel {...props} />);
 fireEvent.change(screen.getByRole("combobox"), { target: { value: "page" } });
 rerender(<InstagramConnectionsPanel {...props} workspaceId="other" />);
 expect(screen.getByRole("combobox")).toHaveValue("");
 expect(screen.getByRole("button", { name: "Connect or refresh Instagram" })).toBeDisabled();
});
it("shows loading and error states without allowing a connection", () => {
 mocks.loading = true; const { rerender } = render(<InstagramConnectionsPanel {...props} />);
 expect(screen.getByRole("status")).toHaveTextContent("Loading Instagram"); expect(screen.getByRole("combobox")).toBeDisabled();
 mocks.loading = false; mocks.error = "Instagram permissions unavailable"; rerender(<InstagramConnectionsPanel {...props} />);
 expect(screen.getByRole("alert")).toHaveTextContent("Instagram permissions unavailable");
});
it("can start Facebook authorization to grant Instagram permissions", () => {
 render(<InstagramConnectionsPanel {...props} pages={[]} />);
 fireEvent.click(screen.getByRole("button", { name: "Connect Facebook for Instagram" }));
 expect(props.onReconnectFacebook).toHaveBeenCalledOnce();
});
it("asks for a workspace before offering connection actions", () => {
 render(<InstagramConnectionsPanel {...props} workspaceId="" />);
 expect(screen.getByText("Select a workspace to manage Instagram accounts.")).toBeInTheDocument();
 expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
});
