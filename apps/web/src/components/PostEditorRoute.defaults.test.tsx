vi.mock("@/hooks/usePublishingCapabilities", () => ({ usePublishingCapabilities: () => ({
  facebook: { publishNow: true, schedule: true },
  linkedin: { publishNow: true, schedule: true },
  instagram: { publishNow: true, schedule: true },
}) }));
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ComponentProps, ReactNode } from "react";
import type { Workspace } from "@/lib/workspaces";
import { PostEditorRoute } from "./PostEditorRoute";
import type { PostEditorForm } from "./PostEditorForm";
import type { PublishingControls } from "@/features/publishing/components/PublishingControls";
import type { AIPostFlow } from "./AIPostFlow";

const state = vi.hoisted(() => ({ workspaces: [] as Workspace[], selected: "507f1f77bcf86cd799439011", search: "", getPost: vi.fn(), create: vi.fn(), facebook: vi.fn() }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn(), useLocation: () => ({ search: state.search }) }));
vi.mock("@/hooks/useWorkspaces", () => ({ useWorkspaces: () => ({ workspaces: state.workspaces, selectedWorkspaceId: state.selected, workspacesLoading: false, workspaceError: "" }) }));
vi.mock("@/auth/useAuth", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
vi.mock("@/hooks/useLinkedInConnection", () => ({ useLinkedInConnection: () => ({ status: "connected", displayName: "Owner", connectionId: "507f1f77bcf86cd799439099", statusError: "" }) }));
vi.mock("@/hooks/useInstagramConnections", () => ({ useInstagramConnections: () => ({ connections: [], loading: false, error: "" }) }));
vi.mock("@/lib/facebookConnections", () => ({ getFacebookPageConnections: (...args: unknown[]) => state.facebook(...args) }));
vi.mock("@/lib/posts", () => ({ createPost: (...args: unknown[]) => state.create(...args), getPostById: (...args: unknown[]) => state.getPost(...args), publishPostNow: vi.fn(), updateDraftPost: vi.fn() }));
vi.mock("@/features/posts/hooks/useComposerAutosave", () => ({ useComposerAutosave: () => ({ clientDraftId: "draft", complete: vi.fn() }) }));
vi.mock("@/components/PostEditorPage", () => ({ PostEditorPage: ({ children, sidebar, headerActions }: { children: ReactNode; sidebar: ReactNode; headerActions: ReactNode }) => <>{headerActions}{sidebar}{children}</> }));
vi.mock("./AIPostFlow", () => ({ AIPostFlow: (props: ComponentProps<typeof AIPostFlow>) => <>{props.headerActions}<output data-testid="ai-publishing-rules">{JSON.stringify(props.publishingRules) ?? "none"}</output><output data-testid="ai-language">{props.defaultLanguage}</output></> }));
vi.mock("@/components/PostPreview", () => ({ PostPreview: () => null }));
vi.mock("@/features/publishing/components/PublishingChecklistPanel", () => ({ PublishingChecklistPanel: () => null }));
vi.mock("@/features/publishing/components/PublishingControls", () => ({ PublishingControls: (props: ComponentProps<typeof PublishingControls>) => <><output data-testid="mode">{props.postMode}</output><output data-testid="zone">{props.timezone}</output><input aria-label="Schedule" value={props.scheduledAt} onChange={(e) => props.onScheduledAtChange(e.target.value)} /><button onClick={() => props.onPostModeChange("draft")}>Explicit draft</button></> }));
vi.mock("@/components/PostEditorForm", () => ({ PostEditorForm: (props: ComponentProps<typeof PostEditorForm>) => <><output data-testid="platforms">{props.selectedPlatforms.join(",")}</output><output data-testid="facebook">{props.selectedFacebookConnectionId}</output><output data-testid="language">{props.defaultLanguage}</output><input aria-label="Caption" value={props.caption} onChange={(e) => props.onCaptionChange(e.target.value)} /><button onClick={() => props.onPlatformsChange(["linkedin"])}>Explicit LinkedIn</button><button onClick={() => props.onFacebookConnectionChange(null)}>Clear Page</button><button onClick={() => void props.onSave()}>Save post</button></> }));

const pageId = "507f1f77bcf86cd799439088";
const workspace = (): Workspace => ({ _id: state.selected, name: "Coffee", ownerUserId: "owner", createdAt: "", updatedAt: "", settings: { timezone: "Asia/Manila", defaultLanguage: "fil", defaultDestinations: { facebook: pageId, linkedin: null }, publishing: { defaultPostMode: "scheduled", preferredTimes: ["09:00"], allowedWeekdays: [0, 1, 2, 3, 4, 5, 6], minimumNoticeMinutes: 0, maximumAdvanceDays: 365 } } });
beforeEach(() => { vi.clearAllMocks(); state.selected = "507f1f77bcf86cd799439011"; state.search = ""; state.workspaces = [workspace()]; state.facebook.mockResolvedValue([{ id: pageId, pageName: "Coffee", status: "connected", canPublish: true }]); });
afterEach(cleanup);

it.each([undefined, null, {}])("opens AI composition when workspace settings are %s", async (settings) => {
  // New workspace responses can omit settings before preferences are saved.
  state.workspaces = [{ ...workspace(), settings } as Workspace];
  render(<PostEditorRoute mode="create" />);
  fireEvent.click(screen.getByRole("button", { name: "AI" }));
  expect(screen.getByTestId("ai-publishing-rules")).toHaveTextContent("none");
  await act(async () => {});
});

it("passes saved publishing preferences to AI composition", async () => {
  render(<PostEditorRoute mode="create" />);
  fireEvent.click(screen.getByRole("button", { name: "AI" }));
  expect(JSON.parse(screen.getByTestId("ai-publishing-rules").textContent!)).toEqual(workspace().settings.publishing);
  expect(screen.getByTestId("ai-language")).toHaveTextContent("fil");
  await act(async () => {});
});

it("initializes new posts with saved defaults and preserves explicit choices across rerenders and late connections", async () => {
  let done!: (value: unknown[]) => void;
  state.facebook.mockReturnValue(new Promise((resolve) => { done = resolve; }));
  const view = render(<PostEditorRoute mode="create" />);
  fireEvent.click(screen.getByRole("button", { name: "Manual" }));
  expect(screen.getByTestId("mode")).toHaveTextContent("scheduled");
  expect(screen.getByTestId("zone")).toHaveTextContent("Asia/Manila");
  expect(screen.getByTestId("language")).toHaveTextContent("fil");
  expect(screen.getByLabelText("Schedule")).not.toHaveValue("");
  expect(state.create).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Explicit draft")); fireEvent.click(screen.getByText("Explicit LinkedIn")); fireEvent.click(screen.getByText("Clear Page"));
  fireEvent.change(screen.getByLabelText("Schedule"), { target: { value: "2027-01-05T14:15" } });
  state.workspaces = [{ ...workspace(), settings: { ...workspace().settings, publishing: { defaultPostMode: "immediate" } } }];
  view.rerender(<PostEditorRoute mode="create" />);
  await act(async () => done([{ id: pageId, pageName: "Coffee", status: "connected", canPublish: true }]));
  expect(screen.getByTestId("mode")).toHaveTextContent("draft");
  expect(screen.getByTestId("platforms")).toHaveTextContent("linkedin");
  expect(screen.getByTestId("facebook")).toBeEmptyDOMElement();
  expect(screen.getByLabelText("Schedule")).toHaveValue("2027-01-05T14:15");
});

it("keeps an explicit calendar date ahead of the workspace's preferred time and mode", async () => {
  state.search = "?date=2027-01-06";
  state.workspaces[0].settings.publishing = { defaultPostMode: "immediate", preferredTimes: ["17:00"] };
  render(<PostEditorRoute mode="create" />);
  fireEvent.click(screen.getByRole("button", { name: "Manual" }));
  expect(screen.getByTestId("mode")).toHaveTextContent("scheduled");
  expect((screen.getByLabelText("Schedule") as HTMLInputElement).value).toContain("2027-01-06");
  await waitFor(() => expect(screen.getByTestId("facebook")).toHaveTextContent(pageId));
});

it("never replaces a saved draft's destinations or mode with workspace defaults", async () => {
  state.getPost.mockResolvedValue({ _id: "post", workspaceId: state.selected, title: "Saved", caption: "Existing", status: "draft", platforms: ["linkedin"], mediaIds: [], platformConnections: {} });
  render(<PostEditorRoute mode="edit" postId="post" />);
  await screen.findByLabelText("Caption");
  expect(screen.getByTestId("mode")).toHaveTextContent("draft");
  expect(screen.getByTestId("platforms")).toHaveTextContent("linkedin");
  expect(screen.getByTestId("facebook")).toBeEmptyDOMElement();
});

it("resets defaults for a newly selected workspace without carrying a prior explicit destination", async () => {
  const view = render(<PostEditorRoute mode="create" />);
  fireEvent.click(screen.getByRole("button", { name: "Manual" }));
  fireEvent.click(screen.getByText("Explicit LinkedIn"));
  state.selected = "507f1f77bcf86cd799439022";
  state.workspaces = [workspace()];
  view.rerender(<PostEditorRoute mode="create" />);
  expect(screen.getByTestId("platforms")).toHaveTextContent("facebook");
  await waitFor(() => expect(screen.getByTestId("facebook")).toHaveTextContent(pageId));
});

it("submits an explicitly selected wall time as UTC in the workspace timezone", async () => {
  state.create.mockResolvedValue({ _id: "saved" });
  render(<PostEditorRoute mode="create" />);
  fireEvent.click(screen.getByRole("button", { name: "Manual" }));
  await waitFor(() => expect(screen.getByTestId("facebook")).toHaveTextContent(pageId));
  fireEvent.change(screen.getByLabelText("Caption"), { target: { value: "Our next coffee story" } });
  fireEvent.change(screen.getByLabelText("Schedule"), { target: { value: "2027-01-06T14:15" } });
  fireEvent.click(screen.getByText("Save post"));
  await waitFor(() => expect(state.create).toHaveBeenCalledWith(expect.objectContaining({ scheduledAt: "2027-01-06T06:15:00.000Z", platforms: ["facebook"], platformConnections: { facebook: pageId } })));
});

it("uses the Now default only as a mode and never publishes automatically", async () => {
  state.workspaces[0].settings.publishing = { defaultPostMode: "immediate" };
  render(<PostEditorRoute mode="create" />);
  fireEvent.click(screen.getByRole("button", { name: "Manual" }));
  await waitFor(() => expect(screen.getByTestId("facebook")).toHaveTextContent(pageId));
  expect(screen.getByTestId("mode")).toHaveTextContent("immediate");
  expect(state.create).not.toHaveBeenCalled();
});
