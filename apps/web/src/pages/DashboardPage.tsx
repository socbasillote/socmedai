import { useNavigate } from "react-router";

import { PAGE_PATHS } from "@/app/navigation/pagePaths";

import { useFacebookOAuthCallback } from "@/features/connections/facebook/hooks/useFacebookOAuthCallback";

import { storeWorkspaceId } from "@/lib/workspaceSelection";

import { useDashboardFacebookConnection } from "@/features/connections/facebook/hooks/useDashboardFacebookConnection";
import { useDashboardLinkedInConnection } from "@/features/connections/linkedin/hooks/useDashboardLinkedInConnection";
import { useDashboardWorkspace } from "@/features/workspaces/hooks/useDashboardWorkspace";
import { useDashboardPosts } from "@/features/posts/hooks/useDashboardPosts";

import { FacebookOAuthCallbackPanel } from "@/features/connections/facebook/components/FacebookOAuthCallbackPanel";
import { useDashboardNavigation } from "@/hooks/useDashboardNavigation";

import { useDashboardNotice } from "@/hooks/useDashboardNotice";

import { DashboardLayout } from "@/components/DashboardLayout";

import { DashboardContentStudioView } from "@/features/content-studio/components/DashboardContentStudioView";

import { DashboardPlaceholderView } from "@/features/dashboard/components/DashboardPlaceholderView";

import { DashboardOverviewView } from "@/features/dashboard/components/DashboardOverviewView";

import { DashboardPostsView } from "@/features/posts/components/DashboardPostsView";

import { DashboardOverlays } from "@/features/dashboard/components/DashboardOverlays";

export default function DashboardPage() {
  const navigate = useNavigate();

  function handleOpenPostEditor() {
    setNotice("");
    navigate("/posts/new");
  }

  const { notice, setNotice, clearNotice } = useDashboardNotice();

  const {
    // Workspace data.
    workspaces,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    workspacesLoading,
    workspaceError,
    selectedWorkspace,

    // Workspace selector.
    workspaceMenuOpen,
    setWorkspaceMenuOpen,

    // Creation form.
    createWorkspaceOpen,
    newWorkspaceName,
    setNewWorkspaceName,
    openCreateWorkspace,
    closeCreateWorkspace,

    // Creation action.
    creatingWorkspace,
    createWorkspaceError,
    setCreateWorkspaceError,
    handleCreateWorkspace,
  } = useDashboardWorkspace(setNotice);

  const posts = useDashboardPosts(selectedWorkspaceId, setNotice);

  const { search, setSearch, selectedPost, handleStudioPostSaved } = posts;

  const {
    facebookCallbackPending,
    facebookCallbackWorkspaceId,
    facebookCallbackWorkspace,
    clearFacebookCallback,
  } = useFacebookOAuthCallback({
    workspaces,
    selectedWorkspaceId,
    workspacesLoading,
    setSelectedWorkspaceId,
    setNotice,
  });

  const {
    status: linkedInStatus,
    displayName: linkedInDisplayName,
    connectionId: linkedInConnectionId,

    statusError: linkedInStatusError,
    connectError: linkedInConnectError,
    disconnectError: linkedInDisconnectError,

    connecting: connectingLinkedIn,
    disconnecting: disconnectingLinkedIn,

    connect: handleConnectLinkedIn,
    disconnect: handleDisconnectLinkedIn,
  } = useDashboardLinkedInConnection(selectedWorkspaceId, setNotice);

  const {
    connecting: connectingFacebook,
    connectError: facebookConnectError,
    connect: handleConnectFacebook,

    connections: facebookConnections,
    connectionsLoading: facebookConnectionsLoading,
    connectionsError: facebookConnectionsError,
    refreshConnections: refreshFacebookConnections,
  } = useDashboardFacebookConnection(selectedWorkspaceId);

  const {
    activePage,
    mobileMenuOpen,
    selectPage,
    openNavigation,
    closeNavigation,
  } = useDashboardNavigation({
    pagePaths: PAGE_PATHS,
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <DashboardLayout
        activePage={activePage}
        mobileMenuOpen={mobileMenuOpen}
        onCloseMobileMenu={closeNavigation}
        onSelectPage={selectPage}
        workspaceSelectorProps={{
          workspaces,
          selectedWorkspace,
          selectedWorkspaceId,
          workspacesLoading,
          workspaceError,
          workspaceMenuOpen,
          setWorkspaceMenuOpen,
          setSelectedWorkspaceId,
          storeWorkspaceId,
          onCreateWorkspace: () => {
            setCreateWorkspaceError("");
            setWorkspaceMenuOpen(false);
            openCreateWorkspace();
          },
        }}
        workspaceName={selectedWorkspace?.name}
        workspacesLoading={workspacesLoading}
        search={search}
        onSearchChange={setSearch}
        onOpenNavigation={openNavigation}
        onNotificationClick={() =>
          setNotice("You are all caught up on notifications.")
        }
        linkedInProps={{
          status: linkedInStatus,
          displayName: linkedInDisplayName,
          connectionId: linkedInConnectionId,
          statusError: linkedInStatusError,
          connectError: linkedInConnectError,
          disconnectError: linkedInDisconnectError,
          connecting: connectingLinkedIn,
          disconnecting: disconnectingLinkedIn,
          workspaceId: selectedWorkspaceId,
          workspacesLoading,
          onConnect: () => void handleConnectLinkedIn(),
          onDisconnect: () => void handleDisconnectLinkedIn(),
        }}
        facebookProps={{
          workspaceId: selectedWorkspaceId,
          workspacesLoading,
          connecting: connectingFacebook,
          connectError: facebookConnectError,
          onConnect: () => void handleConnectFacebook(),
          connections: facebookConnections,
          connectionsLoading: facebookConnectionsLoading,
          connectionsError: facebookConnectionsError,
        }}
        notice={notice}
        onDismissNotice={clearNotice}
      >
        {facebookCallbackPending && (
          <FacebookOAuthCallbackPanel
            workspaceId={facebookCallbackWorkspaceId}
            workspace={facebookCallbackWorkspace}
            workspacesLoading={workspacesLoading}
            workspaceError={workspaceError}
            onConnected={(connections) => {
              // Preserve the existing OAuth cleanup.
              clearFacebookCallback();

              // Refresh the current workspace's Pages.
              void refreshFacebookConnections();

              // Preserve the existing completion notice.
              if (facebookCallbackWorkspace) {
                setNotice(
                  `Successfully connected ${connections.length} Facebook ${
                    connections.length === 1 ? "Page" : "Pages"
                  } to ${facebookCallbackWorkspace.name}.`,
                );
              }
            }}
            onClose={clearFacebookCallback}
          />
        )}

        {activePage === "Overview" ? (
          <DashboardOverviewView
            posts={posts}
            onCreatePost={handleOpenPostEditor}
            onOpenStudio={() => selectPage("Content studio")}
            onViewPublishing={() => selectPage("Publishing")}
            onMoreOptions={(postTitle) => {
              setNotice(`Selected post: ${postTitle}`);
            }}
          />
        ) : activePage === "Content studio" ? (
          <DashboardContentStudioView
            selectedWorkspaceId={selectedWorkspaceId}
            linkedInConnectionId={linkedInConnectionId}
            linkedInDisplayName={linkedInDisplayName}
            linkedInStatus={linkedInStatus}
            onPostSaved={handleStudioPostSaved}
          />
        ) : activePage === "Posts" ? (
          <DashboardPostsView
            posts={posts}
            onEditDraft={(postId) => {
              navigate(`/posts/${encodeURIComponent(postId)}/edit`);
            }}
            onMoreOptions={(postTitle) => {
              setNotice(`Selected post: ${postTitle}`);
            }}
          />
        ) : (
          <DashboardPlaceholderView
            activePage={activePage}
            onReturnToOverview={() => selectPage("Overview")}
          />
        )}
      </DashboardLayout>

      <DashboardOverlays
        createWorkspaceOpen={createWorkspaceOpen}
        workspaceFormProps={{
          name: newWorkspaceName,
          creating: creatingWorkspace,
          error: createWorkspaceError,
          onNameChange: (name) => {
            setNewWorkspaceName(name);
            setCreateWorkspaceError("");
          },
          onSubmit: () => {
            void handleCreateWorkspace(newWorkspaceName);
          },
          onCancel: closeCreateWorkspace,
        }}
        selectedPost={selectedPost}
        onClosePostDetails={() => {
          posts.setSelectedPostId(null);
        }}
      />
    </div>
  );
}
