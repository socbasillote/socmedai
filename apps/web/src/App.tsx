import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate, Navigate } from "react-router";
import { useAuth } from "@/auth/useAuth";

import {
  Activity,
  ArrowRight,
  Bell,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  Image,
  LayoutDashboard,
  Menu,
  Search,
  Send,
  Settings,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";

import AuthPage from "@/auth/AuthPage";
import SignOutButton from "@/auth/SignOutButton";
import { createWorkspace } from "@/lib/workspaces";

import {
  createPost,
  deleteDraftPost,
  updateDraftPost,
  getWorkspacePostsPage,
  type Post,
} from "@/lib/posts";

import { storeWorkspaceId } from "@/lib/workspaceSelection";

import { useLinkedInConnection } from "@/hooks/useLinkedInConnection";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { usePosts } from "@/hooks/usePosts";

import { NoticeBanner } from "@/components/NoticeBanner";
import { WorkspaceSelector } from "@/components/WorkspaceSelector";
import { LinkedInConnectionPanel } from "@/components/LinkedInConnectionPanel";
import { type RecentPostItem } from "@/components/RecentPostsList";

import { CreateDraftForm } from "@/components/CreateDraftForm";
import { CreateWorkspaceForm } from "@/components/CreateWorkspaceForm";
import { DashboardOverview } from "./components/DashboardOverview";

const navigation = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Content calendar", icon: CalendarDays },
  { label: "Content studio", icon: Sparkles },
  { label: "Media library", icon: Image },
  { label: "Publishing", icon: Send },
];

const pagePaths: Record<string, string> = {
  Overview: "/",
  "Content calendar": "/calendar",
  "Content studio": "/studio",
  "Media library": "/media",
  Publishing: "/publishing",
  Analytics: "/analytics",
  Settings: "/settings",
};

function getLocalDateTime() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

function DashboardApp() {
  const [minScheduledAt] = useState(() => getLocalDateTime());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "draft" | "scheduled" | "published" | "failed"
  >("all");

  const [platformFilter, setPlatformFilter] = useState<
    "all" | "facebook" | "instagram" | "linkedin"
  >("all");

  const [caption, setCaption] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<
    ("facebook" | "instagram" | "linkedin")[]
  >(["facebook"]);

  const [loadingMorePosts, setLoadingMorePosts] = useState(false);

  const [savingPost, setSavingPost] = useState(false);
  const [postError, setPostError] = useState("");

  const [postMode, setPostMode] = useState<"draft" | "scheduled">("draft");
  const [scheduledAt, setScheduledAt] = useState("");

  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [deletePostError, setDeletePostError] = useState("");

  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCaption, setEditCaption] = useState("");
  const [editPlatforms, setEditPlatforms] = useState<
    ("facebook" | "instagram" | "linkedin")[]
  >(["facebook"]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editPostError, setEditPostError] = useState("");

  const {
    workspaces,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    workspacesLoading,
    workspaceError,
    addWorkspace,
  } = useWorkspaces();
  const [notice, setNotice] = useState("");

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

  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);

  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [createWorkspaceError, setCreateWorkspaceError] = useState("");

  const selectedWorkspace =
    workspaces.find((workspace) => workspace._id === selectedWorkspaceId) ??
    null;

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const callbackStatus = params.get("linkedin");

    if (callbackStatus !== "connected" && callbackStatus !== "error") {
      return;
    }

    let active = true;

    const handleCallbackResult = async () => {
      await Promise.resolve();

      if (!active) return;

      if (callbackStatus === "connected") {
        setNotice("LinkedIn connected successfully.");
        setLinkedInConnectError("");
        refreshLinkedInStatus();
      } else {
        const reason = params.get("reason");

        setNotice("");
        setLinkedInConnectError(
          reason === "denied"
            ? "LinkedIn authorization was denied. You can try connecting again."
            : "LinkedIn connection failed. Please try again.",
        );
      }
    };

    void handleCallbackResult();

    params.delete("linkedin");
    params.delete("reason");

    const remainingSearch = params.toString();

    navigate(
      {
        pathname: location.pathname,
        search: remainingSearch ? `?${remainingSearch}` : "",
        hash: location.hash,
      },
      { replace: true },
    );

    return () => {
      active = false;
    };
  }, [
    location.hash,
    location.pathname,
    location.search,
    navigate,
    refreshLinkedInStatus,
    setLinkedInConnectError,
  ]);

  const activePage =
    Object.entries(pagePaths).find(
      ([, path]) => path === location.pathname,
    )?.[0] ?? "Not found";

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

  async function saveDraft() {
    const text = caption.trim();

    if (!selectedWorkspaceId) {
      setPostError("Select a workspace before saving a post.");
      return;
    }

    if (!text) {
      setPostError("Enter a caption before saving your post.");
      return;
    }

    if (selectedPlatforms.length === 0) {
      setPostError("Select at least one publishing platform.");
      return;
    }

    let scheduledTime: string | undefined;

    if (postMode === "scheduled") {
      if (!scheduledAt) {
        setPostError("Choose a date and time for your scheduled post.");
        return;
      }

      const parsedTime = new Date(scheduledAt);

      if (
        Number.isNaN(parsedTime.getTime()) ||
        parsedTime.getTime() <= Date.now()
      ) {
        setPostError("Scheduled time must be in the future.");
        return;
      }

      scheduledTime = parsedTime.toISOString();
    }

    setSavingPost(true);
    setPostError("");

    try {
      const post = await createPost({
        workspaceId: selectedWorkspaceId,
        caption: text,
        platforms: selectedPlatforms,
        ...(scheduledTime ? { scheduledAt: scheduledTime } : {}),
      });

      setSavedPosts((current) => [post, ...current]);

      setCaption("");
      setSelectedPlatforms(["facebook"]);
      setScheduledAt("");
      setPostMode("draft");
      setCreateOpen(false);

      setNotice(
        postMode === "scheduled"
          ? "Post scheduled in your workspace."
          : "Draft saved to your workspace.",
      );
    } catch (error) {
      setPostError(
        error instanceof Error ? error.message : "Unable to save the post.",
      );
    } finally {
      setSavingPost(false);
    }
  }

  async function handleDeleteDraft(postId: string, postTitle: string) {
    const confirmed = window.confirm(
      `Delete this draft?\n\n${postTitle}\n\nThis action cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingPostId(postId);
    setDeletePostError("");

    try {
      await deleteDraftPost(postId);

      setSavedPosts((current) => current.filter((post) => post._id !== postId));

      setNotice("Draft deleted successfully.");
    } catch (error) {
      setDeletePostError(
        error instanceof Error ? error.message : "Unable to delete the draft.",
      );
    } finally {
      setDeletingPostId(null);
    }
  }

  const handleEditDraft = (post: Post) => {
    if (post.status !== "draft") {
      return;
    }

    setEditingPostId(post._id);
    setEditTitle(post.title ?? "");
    setEditCaption(post.caption);
    setEditPlatforms(post.platforms);
    setEditPostError("");
    setNotice("");
  };

  const handleSaveDraftEdit = async () => {
    if (!editingPostId) {
      return;
    }

    const trimmedCaption = editCaption.trim();

    if (!trimmedCaption) {
      setEditPostError("Caption is required.");
      return;
    }

    if (editPlatforms.length === 0) {
      setEditPostError("Select at least one publishing platform.");
      return;
    }

    setSavingEdit(true);
    setEditPostError("");

    try {
      const updatedPost = await updateDraftPost(editingPostId, {
        title: editTitle.trim(),
        caption: trimmedCaption,
        platforms: editPlatforms,
      });

      setSavedPosts((currentPosts) =>
        currentPosts.map((post) =>
          post._id === updatedPost._id ? updatedPost : post,
        ),
      );

      setEditingPostId(null);
      setEditPostError("");
      setNotice("Draft updated successfully.");
    } catch (error) {
      setEditPostError(
        error instanceof Error ? error.message : "Failed to update draft.",
      );
    } finally {
      setSavingEdit(false);
    }
  };

  function selectPage(label: string) {
    navigate(pagePaths[label] ?? "/");
    setMobileMenuOpen(false);
  }

  async function handleCreateWorkspace() {
    const name = newWorkspaceName.trim();

    if (!name) {
      setCreateWorkspaceError("Workspace name is required.");
      return;
    }

    if (name.length > 100) {
      setCreateWorkspaceError(
        "Workspace name must be 100 characters or fewer.",
      );
      return;
    }

    setCreatingWorkspace(true);
    setCreateWorkspaceError("");

    try {
      const workspace = await createWorkspace(name);

      addWorkspace(workspace);
      setSelectedWorkspaceId(workspace._id);
      storeWorkspaceId(workspace._id);
      setNewWorkspaceName("");
      setCreateWorkspaceOpen(false);
      setNotice(`Workspace "${workspace.name}" created successfully.`);
    } catch (error) {
      setCreateWorkspaceError(
        error instanceof Error ? error.message : "Unable to create workspace.",
      );
    } finally {
      setCreatingWorkspace(false);
    }
  }

  async function handleLoadMorePosts() {
    if (!selectedWorkspaceId || !nextPostsCursor || loadingMorePosts) {
      return;
    }

    setLoadingMorePosts(true);
    setPostsLoadError("");

    try {
      const result = await getWorkspacePostsPage(selectedWorkspaceId, {
        cursor: nextPostsCursor,
        limit: 20,
        search,
        status: statusFilter,
        platform: platformFilter,
      });

      setSavedPosts((currentPosts) => {
        const existingIds = new Set(currentPosts.map((post) => post._id));
        const newPosts = result.posts.filter(
          (post) => !existingIds.has(post._id),
        );

        return [...currentPosts, ...newPosts];
      });

      setNextPostsCursor(result.nextCursor);
      setHasMorePosts(result.hasMore);
      setDraftCount(result.draftCount);
    } catch (error) {
      setPostsLoadError(
        error instanceof Error ? error.message : "Unable to load more posts.",
      );
    } finally {
      setLoadingMorePosts(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {mobileMenuOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-950 text-slate-300 transition-transform duration-200 lg:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-20 items-center justify-between border-b border-white/10 px-6">
          <Link
            to="/"
            className="flex items-center gap-3"
            onClick={() => selectPage("Overview")}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500 text-white shadow-lg shadow-violet-500/25">
              <Activity size={23} strokeWidth={2.5} />
            </span>
            <span className="text-2xl font-bold tracking-tight text-white">
              storm<span className="text-violet-400">.</span>
            </span>
          </Link>

          <button
            aria-label="Close menu"
            className="rounded-lg p-2 hover:bg-white/10 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <div className="border-b border-white/10 p-4">
          <WorkspaceSelector
            workspaces={workspaces}
            selectedWorkspace={selectedWorkspace}
            selectedWorkspaceId={selectedWorkspaceId}
            workspacesLoading={workspacesLoading}
            workspaceError={workspaceError}
            workspaceMenuOpen={workspaceMenuOpen}
            setWorkspaceMenuOpen={setWorkspaceMenuOpen}
            setSelectedWorkspaceId={setSelectedWorkspaceId}
            storeWorkspaceId={storeWorkspaceId}
            onCreateWorkspace={() => {
              setCreateWorkspaceError("");
              setNewWorkspaceName("");
              setWorkspaceMenuOpen(false);
              setCreateWorkspaceOpen(true);
            }}
          />
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-6">
          <p className="px-3 pb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
            Workspace
          </p>

          {navigation.map(({ label, icon: Icon }) => {
            const active = activePage === label;

            return (
              <button
                key={label}
                onClick={() => selectPage(label)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                  active
                    ? "bg-violet-500/15 text-violet-300"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon size={19} />
                <span className="flex-1 text-left">{label}</span>
                {label === "Publishing" && (
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">
                    3
                  </span>
                )}
              </button>
            );
          })}

          <div className="!mt-8 border-t border-white/10 pt-6">
            <p className="px-3 pb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
              Manage
            </p>
            <button
              onClick={() => selectPage("Analytics")}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium ${
                activePage === "Analytics"
                  ? "bg-violet-500/15 text-violet-300"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <TrendingUp size={19} />
              Analytics
            </button>
            <button
              onClick={() => selectPage("Settings")}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium ${
                activePage === "Settings"
                  ? "bg-violet-500/15 text-violet-300"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Settings size={19} />
              Settings
            </button>
          </div>
        </nav>

        <div className="p-4">
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-violet-500/20 to-indigo-500/10 p-4">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-violet-400/20 text-violet-300">
              <Sparkles size={19} />
            </div>
            <p className="text-sm font-semibold text-white">Create with AI</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Your ideas, ready for the next post.
            </p>
            <button
              onClick={() => selectPage("Content studio")}
              className="mt-3 flex items-center gap-2 text-xs font-semibold text-violet-300 hover:text-white"
            >
              Explore studio <ArrowRight size={14} />
            </button>
          </div>

          <button className="mt-4 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-white">
            <CircleHelp size={18} />
            Help and support
          </button>
        </div>
      </aside>

      <div className="min-h-screen lg:pl-64">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur-xl sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              aria-label="Open navigation"
              className="rounded-lg p-2 hover:bg-slate-100 lg:hidden"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu size={22} />
            </button>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">
                {workspacesLoading
                  ? "Loading workspace..."
                  : (selectedWorkspace?.name ?? "No workspace")}
                {" / Workspace"}
              </p>
              <h1 className="mt-1 truncate text-lg font-bold tracking-tight sm:text-xl">
                {activePage}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <label className="hidden h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 md:flex">
              <Search size={17} className="text-slate-400" />
              <input
                aria-label="Search posts"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search posts..."
                className="w-32 bg-transparent text-sm outline-none placeholder:text-slate-400 lg:w-44"
              />
              <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-400">
                /
              </kbd>
            </label>

            <button
              aria-label="Notifications"
              onClick={() =>
                setNotice("You are all caught up on notifications.")
              }
              className="relative rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50"
            >
              <Bell size={18} />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-violet-500 ring-2 ring-white" />
            </button>

            <button
              aria-label="User profile"
              className="flex items-center gap-2 rounded-xl p-1.5 hover:bg-slate-50"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-700">
                SN
              </div>
              <ChevronDown
                size={15}
                className="hidden text-slate-400 sm:block"
              />
            </button>

            <SignOutButton />

            <LinkedInConnectionPanel
              status={linkedInStatus}
              displayName={linkedInDisplayName}
              connectionId={linkedInConnectionId}
              statusError={linkedInStatusError}
              connectError={linkedInConnectError}
              disconnectError={linkedInDisconnectError}
              connecting={connectingLinkedIn}
              disconnecting={disconnectingLinkedIn}
              workspaceId={selectedWorkspaceId}
              workspacesLoading={workspacesLoading}
              onConnect={() => void handleConnectLinkedIn()}
              onDisconnect={() => void handleDisconnectLinkedIn()}
            />
          </div>
        </header>

        <main className="mx-auto max-w-[1600px] p-4 sm:p-8">
          {notice && (
            <NoticeBanner message={notice} onDismiss={() => setNotice("")} />
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
                if (draft) {
                  handleEditDraft(draft);
                }
              }}
              onDelete={(postId, postTitle) => {
                void handleDeleteDraft(postId, postTitle);
              }}
              onMoreOptions={(postTitle) => {
                setNotice(`Selected post: ${postTitle}`);
              }}
              onLoadMore={() => {
                void handleLoadMorePosts();
              }}
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
              onCancelEdit={() => {
                setEditingPostId(null);
                setEditPostError("");
              }}
              onCreatePost={() => {
                setNotice("");
                setCreateOpen(true);
              }}
              onOpenStudio={() => selectPage("Content studio")}
              onViewPublishing={() => selectPage("Publishing")}
            />
          ) : (
            <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
              <div className="mx-auto max-w-xl text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                  <Sparkles size={26} />
                </div>

                <h2 className="mt-5 text-2xl font-bold tracking-tight text-slate-950">
                  {activePage === "Not found"
                    ? "Page not found"
                    : `${activePage} is coming soon`}
                </h2>

                <p className="mt-3 text-sm leading-6 text-slate-500">
                  {activePage === "Not found"
                    ? "This address does not match a Storm page."
                    : "This section is part of the Storm workspace. Its features will be implemented in a later step."}
                </p>

                <button
                  onClick={() => selectPage("Overview")}
                  className="mt-6 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-700"
                >
                  <LayoutDashboard size={17} />
                  Return to overview
                </button>
              </div>
            </section>
          )}
        </main>
      </div>

      {createWorkspaceOpen && (
        <CreateWorkspaceForm
          name={newWorkspaceName}
          creating={creatingWorkspace}
          error={createWorkspaceError}
          onNameChange={(name) => {
            setNewWorkspaceName(name);
            setCreateWorkspaceError("");
          }}
          onSubmit={() => void handleCreateWorkspace()}
          onCancel={() => setCreateWorkspaceOpen(false)}
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
