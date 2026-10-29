import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import type { ReactNode } from "react";

import App from "./App";

// ---------------------------------------------
// Authentication
// ---------------------------------------------

const mockAppState = vi.hoisted(() => ({
  workspaces: [] as Array<{
    _id: string;
    name: string;
  }>,

  selectedWorkspaceId: "",

  workspacesLoading: false,

  workspaceError: "",

  setSelectedWorkspaceId: vi.fn(),

  setNotice: vi.fn(),
}));

vi.mock("@/auth/useAuth", () => ({
  useAuth: () => ({
    user: { id: "test-user" },
    loading: false,
  }),
}));

// ---------------------------------------------
// Workspace management
// ---------------------------------------------

vi.mock("@/hooks/useWorkspaces", () => ({
  useWorkspaces: () => ({
    workspaces: mockAppState.workspaces,

    selectedWorkspaceId: mockAppState.selectedWorkspaceId,

    setSelectedWorkspaceId: mockAppState.setSelectedWorkspaceId,

    workspacesLoading: mockAppState.workspacesLoading,

    workspaceError: mockAppState.workspaceError,

    addWorkspace: vi.fn(),
  }),
}));

vi.mock("@/hooks/useWorkspaceActions", () => ({
  useWorkspaceActions: () => ({
    creatingWorkspace: false,
    createWorkspaceError: "",
    setCreateWorkspaceError: vi.fn(),
    handleCreateWorkspace: vi.fn(),
  }),
}));

vi.mock("@/hooks/useWorkspaceMenu", () => ({
  useWorkspaceMenu: () => ({
    workspaceMenuOpen: false,
    setWorkspaceMenuOpen: vi.fn(),
  }),
}));

// ---------------------------------------------
// Social connections
// ---------------------------------------------

vi.mock("@/hooks/useLinkedInConnection", () => ({
  useLinkedInConnection: () => ({
    status: "disconnected",
    displayName: "",
    connectionId: "",
    statusError: "",
    connectError: "",
    disconnectError: "",
    connecting: false,
    disconnecting: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    refreshStatus: vi.fn(),
    setConnectError: vi.fn(),
  }),
}));

vi.mock("@/hooks/useLinkedInCallback", () => ({
  useLinkedInCallback: vi.fn(),
}));

vi.mock("@/hooks/useFacebookConnection", () => ({
  useFacebookConnection: () => ({
    connecting: false,
    connectError: "",
    connect: vi.fn(),
  }),
}));

// ---------------------------------------------
// Dashboard state
// ---------------------------------------------

vi.mock("@/hooks/useDashboardNavigation", () => ({
  useDashboardNavigation: () => ({
    activePage: "Overview",
    mobileMenuOpen: false,
    selectPage: vi.fn(),
    openNavigation: vi.fn(),
    closeNavigation: vi.fn(),
  }),
}));

vi.mock("@/hooks/useDashboardNotice", () => ({
  useDashboardNotice: () => ({
    notice: "",
    setNotice: mockAppState.setNotice,
    clearNotice: vi.fn(),
  }),
}));

vi.mock("@/hooks/usePostFilters", () => ({
  usePostFilters: () => ({
    search: "",
    setSearch: vi.fn(),
    statusFilter: "all",
    setStatusFilter: vi.fn(),
    platformFilter: "all",
    setPlatformFilter: vi.fn(),
  }),
}));

vi.mock("@/hooks/useCreateWorkspaceForm", () => ({
  useCreateWorkspaceForm: () => ({
    createWorkspaceOpen: false,
    setCreateWorkspaceOpen: vi.fn(),
    newWorkspaceName: "",
    setNewWorkspaceName: vi.fn(),
    openCreateWorkspace: vi.fn(),
    closeCreateWorkspace: vi.fn(),
  }),
}));

// ---------------------------------------------
// Post management
// ---------------------------------------------

vi.mock("@/hooks/usePosts", () => ({
  usePosts: () => ({
    savedPosts: [],
    setSavedPosts: vi.fn(),
    draftCount: 0,
    setDraftCount: vi.fn(),
    postsLoading: false,
    postsLoadError: "",
    setPostsLoadError: vi.fn(),
    nextPostsCursor: null,
    setNextPostsCursor: vi.fn(),
    hasMorePosts: false,
    setHasMorePosts: vi.fn(),
  }),
}));

vi.mock("@/hooks/usePostPagination", () => ({
  usePostPagination: () => ({
    loadingMorePosts: false,
    handleLoadMorePosts: vi.fn(),
  }),
}));

vi.mock("@/hooks/usePostActions", () => ({
  usePostActions: () => ({
    deletingPostId: null,
    deletePostError: "",
    handleDeleteDraft: vi.fn(),
  }),
}));

vi.mock("@/hooks/useDraftEditing", () => ({
  useDraftEditing: () => ({}),
}));

// ---------------------------------------------
// Render lightweight dashboard components
// ---------------------------------------------

vi.mock("./components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => (
    <main>{children}</main>
  ),
}));

vi.mock("./components/DashboardOverview", () => ({
  DashboardOverview: () => <div>Dashboard Overview</div>,
}));

// Prevent this test from contacting Facebook.
vi.mock("./components/facebook/FacebookOAuthSessionLoader", () => ({
  default: ({
    workspaceId,
    onConnected,
  }: {
    workspaceId: string;
    onConnected?: (
      connections: Array<{
        facebookPageId: string;
        pageName: string;
        status: "connected" | "expired" | "revoked";
      }>,
    ) => void;
  }) => (
    <div>
      <span>Facebook Session Loader</span>

      <output data-testid="facebook-loader-workspace">{workspaceId}</output>

      <button
        type="button"
        onClick={() =>
          onConnected?.([
            {
              facebookPageId: "123456789",
              pageName: "Storm Demo Business",
              status: "connected",
            },
          ])
        }
      >
        Simulate successful Page connection
      </button>
    </div>
  ),
}));
// ---------------------------------------------
// Test helper
// ---------------------------------------------

function LocationProbe() {
  const location = useLocation();

  return (
    <output data-testid="current-location">
      {location.pathname}
      {location.search}
      {location.hash}
    </output>
  );
}

function renderApp(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
      <LocationProbe />
    </MemoryRouter>,
  );
}

// ---------------------------------------------
// Tests
// ---------------------------------------------

describe("Facebook OAuth callback integration", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();

    mockAppState.workspaces = [];
    mockAppState.selectedWorkspaceId = "";
    mockAppState.workspacesLoading = false;
    mockAppState.workspaceError = "";

    mockAppState.setSelectedWorkspaceId.mockReset();
    mockAppState.setNotice.mockReset();
  });

  it("handles a callback without a stored workspace and cleans up the URL", async () => {
    const user = userEvent.setup();

    renderApp("/?facebook=connected");

    // Storm recognizes the Facebook callback.
    expect(screen.getByText("Finish Connecting Facebook")).toBeInTheDocument();

    // No initiating workspace exists in sessionStorage.
    expect(screen.getByRole("alert")).toHaveTextContent(
      "could not identify the workspace",
    );

    // Page selection must not be loaded.
    expect(
      screen.queryByText("Facebook Session Loader"),
    ).not.toBeInTheDocument();

    // The rest of the dashboard remains available.
    expect(screen.getByText("Dashboard Overview")).toBeInTheDocument();

    // Close the incomplete authorization flow.
    await user.click(
      screen.getByRole("button", {
        name: "Close",
      }),
    );

    // The callback query parameter is removed.
    await waitFor(() => {
      expect(screen.getByTestId("current-location")).toHaveTextContent(/^\/$/);
    });

    // The authorization interface disappears.
    expect(
      screen.queryByText("Finish Connecting Facebook"),
    ).not.toBeInTheDocument();

    // Temporary OAuth workspace state remains empty.
    expect(sessionStorage.getItem("storm:facebook-oauth-workspace")).toBeNull();

    // Dashboard remains available after cleanup.
    expect(screen.getByText("Dashboard Overview")).toBeInTheDocument();
  });

  it("prevents Page selection when the initiating workspace is inaccessible", async () => {
    const user = userEvent.setup();

    const inaccessibleWorkspaceId = "507f1f77bcf86cd799439011";

    // Simulate a workspace ID saved before OAuth.
    sessionStorage.setItem(
      "storm:facebook-oauth-workspace",
      inaccessibleWorkspaceId,
    );

    // The accessible workspace list is empty.
    mockAppState.workspaces = [];

    renderApp("/?facebook=connected");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "no longer available to your account",
    );

    // The Facebook session loader must not mount.
    expect(
      screen.queryByText("Facebook Session Loader"),
    ).not.toBeInTheDocument();

    // The application must not switch to an
    // inaccessible workspace.
    expect(mockAppState.setSelectedWorkspaceId).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", {
        name: "Close",
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("current-location")).toHaveTextContent(/^\/$/);
    });

    expect(sessionStorage.getItem("storm:facebook-oauth-workspace")).toBeNull();
  });

  it("restores the workspace that initiated Facebook OAuth", async () => {
    const workspaceA = {
      _id: "507f1f77bcf86cd799439011",
      name: "Marketing Team",
    };

    const workspaceB = {
      _id: "507f1f77bcf86cd799439012",
      name: "Personal Projects",
    };

    mockAppState.workspaces = [workspaceA, workspaceB];

    // Storm currently has Workspace B selected.
    mockAppState.selectedWorkspaceId = workspaceB._id;

    // Facebook OAuth started from Workspace A.
    sessionStorage.setItem("storm:facebook-oauth-workspace", workspaceA._id);

    renderApp("/?facebook=connected");

    // Storm requests restoration of Workspace A.
    await waitFor(() => {
      expect(mockAppState.setSelectedWorkspaceId).toHaveBeenCalledWith(
        workspaceA._id,
      );
    });

    // The normal workspace selection is updated.
    expect(localStorage.getItem("storm")).toBe(workspaceA._id);

    // The Facebook loader receives Workspace A,
    // not whichever workspace was previously selected.
    expect(screen.getByTestId("facebook-loader-workspace")).toHaveTextContent(
      workspaceA._id,
    );

    expect(screen.getByText("Marketing Team")).toBeInTheDocument();
  });

  it("cleans up callback state after Facebook Pages connect", async () => {
    const user = userEvent.setup();

    const workspace = {
      _id: "507f1f77bcf86cd799439011",
      name: "Marketing Team",
    };

    mockAppState.workspaces = [workspace];
    mockAppState.selectedWorkspaceId = workspace._id;

    sessionStorage.setItem("storm:facebook-oauth-workspace", workspace._id);

    renderApp("/?facebook=connected");

    expect(screen.getByText("Facebook Session Loader")).toBeInTheDocument();

    // Simulate the loader receiving confirmation
    // of a successful Page connection.
    await user.click(
      screen.getByRole("button", {
        name: "Simulate successful Page connection",
      }),
    );

    // Temporary OAuth workspace reference is removed.
    expect(sessionStorage.getItem("storm:facebook-oauth-workspace")).toBeNull();

    // The callback parameter is removed.
    await waitFor(() => {
      expect(screen.getByTestId("current-location")).toHaveTextContent(/^\/$/);
    });

    // The parent application receives the success event.
    expect(mockAppState.setNotice).toHaveBeenCalledWith(
      "Successfully connected 1 Facebook Page to Marketing Team.",
    );

    // The callback interface disappears.
    expect(
      screen.queryByText("Finish Connecting Facebook"),
    ).not.toBeInTheDocument();
  });

  it("preserves unrelated URL parameters when closing the callback", async () => {
    const user = userEvent.setup();

    renderApp("/?source=campaign&facebook=connected&tab=accounts#details");

    expect(screen.getByText("Finish Connecting Facebook")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Close",
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("current-location").textContent).toBe(
        "/?source=campaign&tab=accounts#details",
      );
    });

    expect(
      screen.queryByText("Finish Connecting Facebook"),
    ).not.toBeInTheDocument();
  });
});
