import { useState } from "react";
import { useLocation, Navigate } from "react-router";
import { useAuth } from "@/auth/useAuth";

import AuthPage from "@/auth/AuthPage";
import { storeWorkspaceId } from "@/lib/workspaceSelection";

import { useLinkedInConnection } from "@/hooks/useLinkedInConnection";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { usePosts } from "@/hooks/usePosts";
import { usePostActions } from "@/hooks/usePostActions";
import { useDraftEditing } from "@/hooks/useDraftEditing";
import { useWorkspaceActions } from "@/hooks/useWorkspaceActions";
import { useDashboardNavigation } from "@/hooks/useDashboardNavigation";
import { useLinkedInCallback } from "@/hooks/useLinkedInCallback";
import { usePostPagination } from "@/hooks/usePostPagination";
import { useCreatePostForm } from "@/hooks/useCreatePostForm";
import { useCreateWorkspaceForm } from "@/hooks/useCreateWorkspaceForm";
import { usePostFilters } from "@/hooks/usePostFilters";
import { useDashboardNotice } from "@/hooks/useDashboardNotice";
import { useWorkspaceMenu } from "@/hooks/useWorkspaceMenu";

import { type RecentPostItem } from "@/components/RecentPostsList";

import { CreateDraftForm } from "@/components/CreateDraftForm";
import { CreateWorkspaceForm } from "@/components/CreateWorkspaceForm";
import { DashboardOverview } from "./components/DashboardOverview";
import { PagePlaceholder } from "@/components/PagePlaceholder";
import { DashboardLayout } from "./components/DashboardLayout";

import { ContentStudio } from "@/components/ContentStudio";

const pagePaths: Record<string, string> = {
  Overview: "/",
  "Content calendar": "/calendar",
  "Content studio": "/studio",
  "Media library": "/media",
  Publishing: "/publishing",
  Analytics: "/analytics",
  Settings: "/settings",
};

function DashboardApp() {
  const [createOpen, setCreateOpen] = useState(false);

  const { notice, setNotice, clearNotice } = useDashboardNotice();

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
    minScheduledAt,
    caption,
    setCaption,
    selectedPlatforms,
    setSelectedPlatforms,
    postMode,
    setPostMode,
    scheduledAt,
    setScheduledAt,
  } = useCreatePostForm();

  const {
    workspaces,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    workspacesLoading,
    workspaceError,
    addWorkspace,
  } = useWorkspaces();
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

  const {
    savingPost,
    postError,
    setPostError,
    deletingPostId,
    deletePostError,
    saveDraft,
    handleDeleteDraft,
  } = usePostActions({
    selectedWorkspaceId,
    setSavedPosts,
    caption,
    setCaption,
    selectedPlatforms,
    setSelectedPlatforms,
    postMode,
    setPostMode,
    scheduledAt,
    setScheduledAt,
    setCreateOpen,
    setNotice,
  });

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
        notice={notice}
        onDismissNotice={clearNotice}
      >
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
            onCreatePost={() => {
              setNotice("");
              setCreateOpen(true);
            }}
            onOpenStudio={() => selectPage("Content studio")}
            onViewPublishing={() => selectPage("Publishing")}
          />
        ) : activePage === "Content studio" ? (
          <ContentStudio
            selectedWorkspaceId={selectedWorkspaceId}
            onPostSaved={(post) => {
              setSavedPosts((current) => [
                post,
                ...current.filter((item) => item._id !== post._id),
              ]);

              if (post.status === "draft") {
                setDraftCount((current) => current + 1);
              }

              setNotice("Draft saved to your workspace.");
            }}
          />
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

      {createOpen && (
        <CreateDraftForm
          caption={caption}
          selectedPlatforms={selectedPlatforms}
          savingPost={savingPost}
          postError={postError}
          postMode={postMode}
          scheduledAt={scheduledAt}
          minScheduledAt={minScheduledAt}
          onCaptionChange={(value) => {
            setCaption(value);
            setPostError("");
          }}
          onPlatformsChange={(platforms) => {
            setSelectedPlatforms(platforms);
            setPostError("");
          }}
          onPostModeChange={(mode) => {
            setPostMode(mode);
            setPostError("");
          }}
          onScheduledAtChange={(value) => {
            setScheduledAt(value);
            setPostError("");
          }}
          onSave={() => void saveDraft()}
          onCancel={() => setCreateOpen(false)}
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

  return <DashboardApp />;
}
