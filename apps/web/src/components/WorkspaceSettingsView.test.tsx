import { cleanup, fireEvent, render, screen, waitFor, act, within } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { WorkspaceSettingsView } from "./WorkspaceSettingsView";
import { saveWorkspacePreferences, setWorkspaceLifecycle } from "@/lib/workspaceSettings";
import type { Workspace } from "@/lib/workspaces";

const hooks = vi.hoisted(() => ({ connectFacebook: vi.fn(), connectLinkedin: vi.fn(), refreshFacebook: vi.fn(), refreshLinkedin: vi.fn(), disconnect: vi.fn() }));
vi.mock("@/lib/workspaceSettings", async (load) => ({ ...await load<object>(), saveWorkspacePreferences: vi.fn(), setWorkspaceLifecycle: vi.fn() }));
vi.mock("@/hooks/useFacebookConnections", () => ({ useFacebookConnections: () => ({ connections: [{ id: "facebook", pageName: "Coffee Page", status: "connected", canPublish: true }, { id: "expired", pageName: "Expired Page", status: "expired", canPublish: false }], loading: false, error: "", refreshConnections: hooks.refreshFacebook }) }));
vi.mock("@/hooks/useFacebookConnection", () => ({ useFacebookConnection: () => ({ connect: hooks.connectFacebook, connecting: false, connectError: "" }) }));
vi.mock("@/hooks/useLinkedInConnection", () => ({ useLinkedInConnection: () => ({ connectionId: "linkedin", displayName: "Coffee Owner", status: "connected", connect: hooks.connectLinkedin, disconnect: hooks.disconnect, refreshStatus: hooks.refreshLinkedin }) }));
const workspace: Workspace = { _id: "507f1f77bcf86cd799439011", name: "Coffee", settings: { timezone: "Asia/Manila" }, ownerUserId: "owner", createdAt: "", updatedAt: "" };
const onUpdated = vi.fn(), onDeleted = vi.fn();
function mount(value = workspace) { return render(<WorkspaceSettingsView key={value._id} workspace={value} onUpdated={onUpdated} onDeleted={onDeleted} />); }
function tab(name: string) { fireEvent.click(screen.getByRole("button", { name })); }
beforeEach(() => { vi.clearAllMocks(); vi.mocked(saveWorkspacePreferences).mockResolvedValue(workspace); vi.mocked(setWorkspaceLifecycle).mockResolvedValue({ ...workspace, archivedAt: "2026-11-20" }); });
afterEach(cleanup);

it("saves general fields separately without overwriting publishing or branding settings", async () => {
  mount();
  fireEvent.change(screen.getByLabelText("Workspace name"), { target: { value: "Coffee team" } });
  fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Daily coffee stories" } });
  fireEvent.change(screen.getByLabelText(/Default language/), { target: { value: "fil" } });
  tab("Publishing Preferences"); tab("General Settings");
  expect(screen.getByLabelText("Workspace name")).toHaveValue("Coffee team");
  fireEvent.click(screen.getByRole("button", { name: "Save general settings" }));
  await screen.findByText("General Settings saved.");
  expect(saveWorkspacePreferences).toHaveBeenCalledWith(workspace._id, { name: "Coffee team", description: "Daily coffee stories", timezone: "Asia/Manila", defaultLanguage: "fil", avatar: "" });
  expect(onUpdated).toHaveBeenCalledWith(workspace);
});

it("shows status, reconnects accounts, refreshes, and saves only valid selected defaults", async () => {
  mount(); tab("Social Accounts");
  expect(screen.getByText("Coffee Page")).toBeInTheDocument();
  expect(screen.getByText("expired")).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Expired Page (expired)" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Reconnect Facebook" }));
  fireEvent.click(screen.getByRole("button", { name: "Reconnect LinkedIn" }));
  fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
  expect(hooks.disconnect).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Refresh connection status" }));
  expect(hooks.connectFacebook).toHaveBeenCalledOnce(); expect(hooks.connectLinkedin).toHaveBeenCalledOnce();
  expect(hooks.refreshFacebook).toHaveBeenCalledOnce(); expect(hooks.refreshLinkedin).toHaveBeenCalledOnce();
  fireEvent.change(screen.getByLabelText("Default Facebook Page"), { target: { value: "facebook" } });
  fireEvent.change(screen.getByLabelText("Default LinkedIn account"), { target: { value: "linkedin" } });
  fireEvent.click(screen.getByRole("button", { name: "Save publishing destinations" }));
  await waitFor(() => expect(saveWorkspacePreferences).toHaveBeenCalledWith(workspace._id, { defaultDestinations: { facebook: "facebook", linkedin: "linkedin" } }));
  expect(screen.getByText("Unavailable in settings")).toBeInTheDocument();
});

it("persists publishing times, mode, timezone and scheduling rules while approvals stay unavailable", async () => {
  mount(); tab("Publishing Preferences");
  fireEvent.change(screen.getByLabelText("Default post mode"), { target: { value: "scheduled" } });
  fireEvent.click(screen.getByRole("button", { name: "Add preferred time" }));
  fireEvent.change(screen.getByLabelText("Preferred time 1"), { target: { value: "17:30" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Sun" }));
  fireEvent.change(screen.getByLabelText("Minimum notice (minutes)"), { target: { value: "90" } });
  fireEvent.change(screen.getByLabelText("Maximum advance (days)"), { target: { value: "30" } });
  expect(screen.getByRole("checkbox", { name: /Require approval/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Save publishing preferences" }));
  await screen.findByText("Publishing Preferences saved.");
  expect(saveWorkspacePreferences).toHaveBeenCalledWith(workspace._id, { timezone: "Asia/Manila", publishing: { defaultPostMode: "scheduled", preferredTimes: ["17:30"], allowedWeekdays: [1, 2, 3, 4, 5, 6], minimumNoticeMinutes: 90, maximumAdvanceDays: 30 } });
});

it("requires exact-name lifecycle confirmation and supports cancelling with Escape", async () => {
  mount(); fireEvent.click(screen.getByRole("button", { name: "Archive workspace" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByRole("button", { name: "Confirm archive" })).toBeDisabled();
  expect(within(dialog).getByLabelText("Confirm workspace name")).toHaveFocus();
  fireEvent.change(within(dialog).getByLabelText("Confirm workspace name"), { target: { value: "Coffee" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Confirm archive" }));
  await waitFor(() => expect(setWorkspaceLifecycle).toHaveBeenCalledWith(workspace._id, "archive", "Coffee"));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Delete workspace" }));
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("deletes only after confirmation and removes the correct workspace", async () => {
  vi.mocked(setWorkspaceLifecycle).mockResolvedValue(null);
  mount(); fireEvent.click(screen.getByRole("button", { name: "Delete workspace" }));
  fireEvent.change(screen.getByLabelText("Confirm workspace name"), { target: { value: "Coffee" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
  await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(workspace._id));
});

it("disables editing archived workspaces and allows restore", async () => {
  mount({ ...workspace, archivedAt: "2026-11-20" });
  expect(screen.getByLabelText("Workspace name")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Save general settings" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Restore workspace" }));
  fireEvent.change(screen.getByLabelText("Confirm workspace name"), { target: { value: "Coffee" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm restore" }));
  await waitFor(() => expect(setWorkspaceLifecycle).toHaveBeenCalledWith(workspace._id, "restore", "Coffee"));
});

it("shows save failures and keeps edits for retry", async () => {
  vi.mocked(saveWorkspacePreferences).mockRejectedValueOnce(new Error("Timezone is invalid"));
  mount(); fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Keep this" } });
  fireEvent.click(screen.getByRole("button", { name: "Save general settings" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Timezone is invalid");
  expect(screen.getByLabelText("Description")).toHaveValue("Keep this");
  expect(onUpdated).not.toHaveBeenCalled();
});

it("blocks duplicate saves and keeps a late result scoped to its original workspace", async () => {
  let resolve!: (workspace: Workspace) => void;
  vi.mocked(saveWorkspacePreferences).mockReturnValue(new Promise((done) => { resolve = done; }));
  const view = mount();
  fireEvent.click(screen.getByRole("button", { name: "Save general settings" }));
  fireEvent.click(screen.getByRole("button", { name: "Saving…" }));
  expect(saveWorkspacePreferences).toHaveBeenCalledOnce();
  view.rerender(<WorkspaceSettingsView key="other" workspace={{ ...workspace, _id: "other", name: "Other" }} onUpdated={onUpdated} onDeleted={onDeleted} />);
  await act(async () => resolve({ ...workspace, name: "Saved original" }));
  expect(screen.getByLabelText("Workspace name")).toHaveValue("Other");
  expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ _id: workspace._id }));
});

it("rejects unsupported avatar files before attempting a save", async () => {
  mount();
  fireEvent.change(screen.getByLabelText("Upload workspace avatar"), { target: { files: [new File(["svg"], "avatar.svg", { type: "image/svg+xml" })] } });
  expect(await screen.findByRole("alert")).toHaveTextContent("under 120 KB");
  expect(saveWorkspacePreferences).not.toHaveBeenCalled();
});

it("previews an uploaded avatar, supports removal, and shares timezone between tabs", async () => {
  mount();
  const bytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1sAAAAASUVORK5CYII="), (value) => value.charCodeAt(0));
  fireEvent.change(screen.getByLabelText("Upload workspace avatar"), { target: { files: [new File([bytes], "avatar.png", { type: "image/png" })] } });
  expect(await screen.findByAltText("Workspace avatar")).toHaveAttribute("src", expect.stringContaining("data:image/png;base64,"));
  fireEvent.click(screen.getByRole("button", { name: "Remove avatar" }));
  expect(screen.queryByAltText("Workspace avatar")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/^Timezone/), { target: { value: "UTC" } });
  tab("Publishing Preferences");
  expect(screen.getByLabelText(/Publishing timezone/)).toHaveValue("UTC");
  fireEvent.click(screen.getByRole("button", { name: "Add preferred time" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove preferred time 1" }));
  expect(screen.queryByLabelText("Preferred time 1")).not.toBeInTheDocument();
});

it("keeps lifecycle failures recoverable without closing the confirmation dialog", async () => {
  vi.mocked(setWorkspaceLifecycle).mockRejectedValueOnce(new Error("Cancel scheduled posts first."));
  mount(); fireEvent.click(screen.getByRole("button", { name: "Archive workspace" }));
  fireEvent.change(screen.getByLabelText("Confirm workspace name"), { target: { value: "Coffee" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm archive" }));
  await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent("Cancel scheduled posts first."));
  expect(onUpdated).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
