import { useEffect, useState } from "react";
import { useLocation, useNavigate, Navigate } from "react-router";
import { useAuth } from "@/auth/useAuth";

import AuthPage from "@/auth/AuthPage";
import { storeWorkspaceId } from "@/lib/workspaceSelection";

import { useLinkedInConnection } from "@/hooks/useLinkedInConnection";
import { useFacebookConnection } from "@/hooks/useFacebookConnection";
import { useFacebookConnections } from "@/hooks/useFacebookConnections";

import FacebookOAuthSessionLoader from "@/components/facebook/FacebookOAuthSessionLoader";

import {
  readFacebookOAuthWorkspaceId,
  clearFacebookOAuthWorkspaceId,
} from "@/lib/facebookOAuthWorkspace";

import { useWorkspaces } from "@/hooks/useWorkspaces";
import { usePosts } from "@/hooks/usePosts";
import { usePostActions } from "@/hooks/usePostActions";
import { useDraftEditing } from "@/hooks/useDraftEditing";
import { useWorkspaceActions } from "@/hooks/useWorkspaceActions";
import { useDashboardNavigation } from "@/hooks/useDashboardNavigation";
import { useLinkedInCallback } from "@/hooks/useLinkedInCallback";
import { usePostPagination } from "@/hooks/usePostPagination";
import { useCreateWorkspaceForm } from "@/hooks/useCreateWorkspaceForm";
import { usePostFilters } from "@/hooks/usePostFilters";
import { useDashboardNotice } from "@/hooks/useDashboardNotice";
import { useWorkspaceMenu } from "@/hooks/useWorkspaceMenu";

import {
  RecentPostsList,
  type RecentPostItem,
} from "@/components/RecentPostsList";

import { PostsPage } from "@/components/PostsPage";
import { PostDetailsModal } from "@/components/PostDetailsModal";

import { CreateWorkspaceForm } from "@/components/CreateWorkspaceForm";
import { DashboardOverview } from "./components/DashboardOverview";
import { PagePlaceholder } from "@/components/PagePlaceholder";
import { DashboardLayout } from "./components/DashboardLayout";

import { ContentStudio } from "@/components/ContentStudio";
import { PostEditorRoute } from "@/components/PostEditorRoute";

const pagePaths: Record<string, string> = {
  Overview: "/",
  Posts: "/posts",
  "Content calendar": "/calendar",
  "Content studio": "/studio",
  "Media library": "/media",
  Publishing: "/publishing",
  Analytics: "/analytics",
  Settings: "/settings",
};

function DashboardApp() {
  const navigate = useNavigate();
  const location = useLocation();

  const facebookCallbackPending =
    new URLSearchParams(location.search).get("facebook") === "connected";

  const facebookCallbackWorkspaceId = facebookCallbackPending
    ? readFacebookOAuthWorkspaceId()
    : null;

  function handleOpenPostEditor() {
    setNotice("");
    navigate("/posts/new");
  }

  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  const { notice, setNotice, clearNotice } = useDashboardNotice();

  /**
   * Handle unsuccessful Facebook OAuth callbacks.
   *
   * The backend redirects to:
   *   /?facebook=error&reason=denied
   *   /?facebook=error&reason=failed
   *
   * Clear the temporary workspace and remove
   * the callback parameters without disrupting
   * unrelated URL parameters.
   */
  useEffect(() => {
    const params = new URLSearchParams(location.search);

    if (params.get("facebook") !== "error") {
      return;
    }

    const reason = params.get("reason");

    clearFacebookOAuthWorkspaceId();

    if (reason === "denied") {
      setNotice(
        "Facebook authorization was cancelled. No Facebook Pages were connected.",
      );
    } else {
      setNotice("Facebook authorization failed. Please try connecting again.");
    }

    params.delete("facebook");
    params.delete("reason");

    const search = params.toString();

    navigate(
      {
        pathname: location.pathname,
        search: search ? `?${search}` : "",
        hash: location.hash,
      },
      {
        replace: true,
      },
    );
  }, [location.pathname, location.search, location.hash, navigate, setNotice]);

  const { workspaceMenuOpen, setWorkspaceMenuOpen } = useWorkspaceMenu();

  const {
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    platformFilter,
    setPlatformFilter,
  } = usePostFilters();

  const {
    createWorkspaceOpen,
    setCreateWorkspaceOpen,
    newWorkspaceName,
    setNewWorkspaceName,
    openCreateWorkspace,
    closeCreateWorkspace,
  } = useCreateWorkspaceForm();

  const {
    workspaces,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    workspacesLoading,
    workspaceError,
    addWorkspace,
  } = useWorkspaces();

  const facebookCallbackWorkspace = facebookCallbackWorkspaceId
    ? workspaces.find(
        (workspace) => workspace._id === facebookCallbackWorkspaceId,
      )
    : undefined;

  useEffect(() => {
    if (
      !facebookCallbackPending ||
      workspacesLoading ||
      !facebookCallbackWorkspaceId ||
      !facebookCallbackWorkspace
    ) {
      return;
    }

    if (selectedWorkspaceId === facebookCallbackWorkspaceId) {
      return;
    }

    // Restore the workspace that originally initiated OAuth.
    setSelectedWorkspaceId(facebookCallbackWorkspaceId);
    storeWorkspaceId(facebookCallbackWorkspaceId);
  }, [
    facebookCallbackPending,
    facebookCallbackWorkspaceId,
    facebookCallbackWorkspace,
    workspacesLoading,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
  ]);

  function clearFacebookCallback() {
    clearFacebookOAuthWorkspaceId();

    const params = new URLSearchParams(location.search);

    params.delete("facebook");

    const search = params.toString();

    navigate(
      {
        pathname: location.pathname,
        search: search ? `?${search}` : "",
        hash: location.hash,
      },
      {
        replace: true,
      },
    );
  }
  const {
    creatingWorkspace,
    createWorkspaceError,
    setCreateWorkspaceError,
    handleCreateWorkspace,
  } = useWorkspaceActions({
    addWorkspace,
    setSelectedWorkspaceId,
    setNewWorkspaceName,
    setCreateWorkspaceOpen,
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
    refreshStatus: refreshLinkedInStatus,
    setConnectError: setLinkedInConnectError,
  } = useLinkedInConnection(selectedWorkspaceId, setNotice);

  useLinkedInCallback({
    refreshStatus: refreshLinkedInStatus,
    setConnectError: setLinkedInConnectError,
    setNotice,
  });

  const {
    connecting: connectingFacebook,
    connectError: facebookConnectError,
    connect: handleConnectFacebook,
  } = useFacebookConnection(selectedWorkspaceId);

  const {
    connections: facebookConnections,
    loading: facebookConnectionsLoading,
    error: facebookConnectionsError,
    refreshConnections: refreshFacebookConnections,
  } = useFacebookConnections(selectedWorkspaceId);

  const {
    savedPosts,
    setSavedPosts,
    draftCount,
    setDraftCount,
    postsLoading,
    postsLoadError,
    setPostsLoadError,
    nextPostsCursor,
    setNextPostsCursor,
    hasMorePosts,
    setHasMorePosts,
  } = usePosts(selectedWorkspaceId, search, statusFilter, platformFilter);
  const { loadingMorePosts, handleLoadMorePosts } = usePostPagination({
    selectedWorkspaceId,
    nextPostsCursor,
    search,
    statusFilter,
    platformFilter,
    setSavedPosts,
    setNextPostsCursor,
    setHasMorePosts,
    setDraftCount,
    setPostsLoadError,
  });

  const { deletingPostId, deletePostError, handleDeleteDraft } = usePostActions(
    {
      setSavedPosts,
      setNotice,
    },
  );

  const {
    editingPostId,
    editTitle,
    setEditTitle,
    editCaption,
    setEditCaption,
    editPlatforms,
    setEditPlatforms,
    savingEdit,
    editPostError,
    handleEditDraft,
    handleSaveDraftEdit,
    cancelEdit,
  } = useDraftEditing({
    setSavedPosts,
    setNotice,
  });

  const {
    activePage,
    mobileMenuOpen,
    selectPage,
    openNavigation,
    closeNavigation,
  } = useDashboardNavigation({ pagePaths });

  const selectedWorkspace =
    workspaces.find((workspace) => workspace._id === selectedWorkspaceId) ??
    null;

  const savedPostItems: RecentPostItem[] = savedPosts.map((post) => {
    const isScheduled = post.status === "scheduled";
    const displayDate = isScheduled ? post.scheduledAt : post.createdAt;

    return {
      id: post._id,
      title: post.title || post.caption,
      platform: post.platforms.join(", "),
      date: displayDate
        ? new Date(displayDate).toLocaleString()
        : "Date unavailable",
      status: post.status.charAt(0).toUpperCase() + post.status.slice(1),
      lastError: post.lastError,
      color:
        post.status === "failed"
          ? "bg-rose-100 text-rose-700"
          : post.status === "published"
            ? "bg-emerald-100 text-emerald-700"
            : post.status === "scheduled"
              ? "bg-blue-100 text-blue-700"
              : "bg-violet-100 text-violet-700",
      initials: "DR",
    };
  });

  const filteredPosts = savedPostItems;
  const selectedPost = selectedPostId
    ? (savedPosts.find((post) => post._id === selectedPostId) ?? null)
    : null;

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
          <section
            aria-label="Facebook account authorization"
            className="mb-6 rounded-xl border border-blue-200 bg-blue-50/50 p-4 sm:p-6"
          >
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                Facebook Authorization
              </p>

              <h2 className="mt-1 text-xl font-semibold text-slate-900">
                Finish Connecting Facebook
              </h2>

              <p className="mt-2 text-sm text-slate-600">
                Select the Facebook Pages you want to connect to your Storm
                workspace.
              </p>
            </div>

            {workspacesLoading ? (
              <div
                role="status"
                className="rounded-lg bg-white p-4 text-sm text-slate-600"
              >
                Checking your workspace...
              </div>
            ) : !facebookCallbackWorkspaceId ? (
              <div
                role="alert"
                className="rounded-lg border border-amber-200 bg-white p-4"
              >
                <p className="text-sm text-amber-800">
                  Storm could not identify the workspace that initiated Facebook
                  authorization. Please start the Facebook connection again.
                </p>

                <button
                  type="button"
                  onClick={clearFacebookCallback}
                  className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
            ) : !facebookCallbackWorkspace ? (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-white p-4"
              >
                <p className="text-sm text-red-700">
                  The workspace that initiated Facebook authorization is no
                  longer available to your account.
                </p>

                {workspaceError && (
                  <p className="mt-2 text-sm text-red-600">{workspaceError}</p>
                )}

                <button
                  type="button"
                  onClick={clearFacebookCallback}
                  className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border border-blue-100 bg-white px-4 py-3">
                  <p className="text-xs text-slate-500">
                    Connecting Pages to workspace
                  </p>

                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {facebookCallbackWorkspace.name}
                  </p>
                </div>

                <FacebookOAuthSessionLoader
                  workspaceId={facebookCallbackWorkspaceId}
                  onConnected={(connections) => {
                    clearFacebookCallback();
                    refreshFacebookConnections();

                    setNotice(
                      `Successfully connected ${connections.length} Facebook ${
                        connections.length === 1 ? "Page" : "Pages"
                      } to ${facebookCallbackWorkspace.name}.`,
                    );
                  }}
                  onClose={clearFacebookCallback}
                />
              </div>
            )}
          </section>
        )}
        {activePage === "Overview" ? (
          <DashboardOverview
            draftCount={draftCount}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            platformFilter={platformFilter}
            setPlatformFilter={setPlatformFilter}
            deletePostError={deletePostError}
            posts={filteredPosts}
            postsLoading={postsLoading}
            postsLoadError={postsLoadError}
            search={search}
            deletingPostId={deletingPostId}
            hasMorePosts={hasMorePosts}
            loadingMorePosts={loadingMorePosts}
            onEdit={(postId) => {
              const draft = savedPosts.find((item) => item._id === postId);
              if (draft) handleEditDraft(draft);
            }}
            onDelete={(postId, postTitle) => {
              void handleDeleteDraft(postId, postTitle);
            }}
            onMoreOptions={(postTitle) => {
              setNotice(`Selected post: ${postTitle}`);
            }}
            onLoadMore={handleLoadMorePosts}
            editingPostId={editingPostId}
            editTitle={editTitle}
            editCaption={editCaption}
            editPlatforms={editPlatforms}
            savingEdit={savingEdit}
            editPostError={editPostError}
            onEditTitleChange={setEditTitle}
            onEditCaptionChange={setEditCaption}
            onEditPlatformsChange={setEditPlatforms}
            onSaveEdit={() => void handleSaveDraftEdit()}
            onCancelEdit={cancelEdit}
            onCreatePost={handleOpenPostEditor}
            onOpenStudio={() => selectPage("Content studio")}
            onViewPublishing={() => selectPage("Publishing")}
          />
        ) : activePage === "Content studio" ? (
          <ContentStudio
            selectedWorkspaceId={selectedWorkspaceId}
            linkedInConnectionId={linkedInConnectionId}
            linkedInDisplayName={linkedInDisplayName}
            linkedInStatus={linkedInStatus}
            onPostSaved={(post) => {
              setSavedPosts((current) => [
                post,
                ...current.filter((item) => item._id !== post._id),
              ]);

              if (post.status === "draft") {
                setDraftCount((current) => current + 1);
              }

              setNotice(
                post.status === "scheduled"
                  ? "Post scheduled successfully."
                  : "Draft saved to your workspace.",
              );
            }}
          />
        ) : activePage === "Posts" ? (
          <PostsPage
            search={search}
            statusFilter={statusFilter}
            platformFilter={platformFilter}
            onSearchChange={setSearch}
            onStatusFilterChange={setStatusFilter}
            onPlatformFilterChange={setPlatformFilter}
          >
            <RecentPostsList
              posts={filteredPosts}
              loading={postsLoading}
              loadError={postsLoadError}
              onView={setSelectedPostId}
              search={search}
              deleteError={deletePostError}
              deletingPostId={deletingPostId}
              hasMorePosts={hasMorePosts}
              loadingMorePosts={loadingMorePosts}
              onEdit={(postId) => {
                const draft = savedPosts.find(
                  (item) => item._id === postId && item.status === "draft",
                );

                if (!draft) {
                  return;
                }

                navigate(`/posts/${encodeURIComponent(draft._id)}/edit`);
              }}
              onDelete={(postId, postTitle) => {
                void handleDeleteDraft(postId, postTitle);
              }}
              onMoreOptions={(postTitle) => {
                setNotice(`Selected post: ${postTitle}`);
              }}
              onLoadMore={handleLoadMorePosts}
            />
          </PostsPage>
        ) : (
          <PagePlaceholder
            activePage={activePage}
            onReturnToOverview={() => selectPage("Overview")}
          />
        )}
      </DashboardLayout>

      {createWorkspaceOpen && (
        <CreateWorkspaceForm
          name={newWorkspaceName}
          creating={creatingWorkspace}
          error={createWorkspaceError}
          onNameChange={(name) => {
            setNewWorkspaceName(name);
            setCreateWorkspaceError("");
          }}
          onSubmit={() => void handleCreateWorkspace(newWorkspaceName)}
          onCancel={closeCreateWorkspace}
        />
      )}

      {selectedPost && (
        <PostDetailsModal
          post={selectedPost}
          onClose={() => setSelectedPostId(null)}
        />
      )}
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const { user, loading } = useAuth();

  const isAuthRoute =
    location.pathname === "/login" || location.pathname === "/signup";

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div
            className="mx-auto mb-4 size-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900"
            role="status"
            aria-label="Loading"
          />
          <p className="text-sm text-slate-600">Restoring your session...</p>
        </div>
      </main>
    );
  }

  if (!user && !isAuthRoute) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (user && isAuthRoute) {
    return <Navigate to="/" replace />;
  }

  if (isAuthRoute) {
    return <AuthPage />;
  }

  const isNewPostRoute = location.pathname === "/posts/new";

  const editPostMatch = location.pathname.match(/^\/posts\/([^/]+)\/edit\/?$/);

  if (isNewPostRoute || editPostMatch) {
    return (
      <PostEditorRoute
        mode={isNewPostRoute ? "create" : "edit"}
        postId={editPostMatch?.[1]}
      />
    );
  }

  return <DashboardApp />;
}
