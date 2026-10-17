import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate, Navigate } from "react-router";
import { useAuth } from "@/auth/useAuth";

import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  FileText,
  Heart,
  Image,
  LayoutDashboard,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
  TrendingUp,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import AuthPage from "@/auth/AuthPage";
import SignOutButton from "@/auth/SignOutButton";
import {
  createWorkspace,
  getWorkspaces,
  type Workspace,
} from "@/lib/workspaces";

import {
  createPost,
  deleteDraftPost,
  updateDraftPost,
  getWorkspacePostsPage,
  type Post,
} from "@/lib/posts";

import {
  clearStoredWorkspaceId,
  readStoredWorkspaceId,
  storeWorkspaceId,
} from "@/lib/workspaceSelection";

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

const weeklyActivity = [
  { day: "Mon", height: 42 },
  { day: "Tue", height: 66 },
  { day: "Wed", height: 52 },
  { day: "Thu", height: 86 },
  { day: "Fri", height: 62 },
  { day: "Sat", height: 35 },
  { day: "Sun", height: 48 },
];

function DashboardApp() {
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

  const [postsLoading, setPostsLoading] = useState(false);
  const [postsLoadError, setPostsLoadError] = useState("");
  const [loadingMorePosts, setLoadingMorePosts] = useState(false);

  const [nextPostsCursor, setNextPostsCursor] = useState<string | null>(null);
  const [hasMorePosts, setHasMorePosts] = useState(false);

  const [notice, setNotice] = useState("");
  const [savingPost, setSavingPost] = useState(false);
  const [postError, setPostError] = useState("");
  const [savedPosts, setSavedPosts] = useState<Post[]>([]);
  const [draftCount, setDraftCount] = useState(0);

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

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspacesLoading, setWorkspacesLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState("");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);

  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [createWorkspaceError, setCreateWorkspaceError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadWorkspaces() {
      setWorkspacesLoading(true);
      setWorkspaceError("");

      try {
        const result = await getWorkspaces();

        if (active) {
          setWorkspaces(result);

          const storedId = readStoredWorkspaceId();

          const validStoredWorkspace = storedId
            ? result.find((workspace) => workspace._id === storedId)
            : undefined;

          const nextWorkspaceId =
            validStoredWorkspace?._id ?? result[0]?._id ?? "";

          setSelectedWorkspaceId(nextWorkspaceId);

          if (nextWorkspaceId) {
            storeWorkspaceId(nextWorkspaceId);
          } else {
            clearStoredWorkspaceId();
          }
        }
      } catch (error) {
        if (active) {
          setWorkspaceError(
            error instanceof Error
              ? error.message
              : "Unable to load your workspaces.",
          );
        }
      } finally {
        if (active) {
          setWorkspacesLoading(false);
        }
      }
    }

    void loadWorkspaces();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadPosts() {
      if (!selectedWorkspaceId) {
        setSavedPosts([]);
        setDraftCount(0);
        setNextPostsCursor(null);
        setHasMorePosts(false);
        setPostsLoading(false);
        setPostsLoadError("");
        return;
      }

      setPostsLoading(true);
      setPostsLoadError("");

      try {
        setNextPostsCursor(null);
        setHasMorePosts(false);

        const result = await getWorkspacePostsPage(selectedWorkspaceId, {
          limit: 20,
          search,
          status: statusFilter,
          platform: platformFilter,
        });

        if (active) {
          setSavedPosts(result.posts);
          setDraftCount(result.draftCount);
          setNextPostsCursor(result.nextCursor);
          setHasMorePosts(result.hasMore);
        }
      } catch (error) {
        if (active) {
          setSavedPosts([]);
          setDraftCount(0);
          setNextPostsCursor(null);
          setHasMorePosts(false);
          setPostsLoadError(
            error instanceof Error
              ? error.message
              : "Unable to load workspace posts.",
          );
        }
      } finally {
        if (active) {
          setPostsLoading(false);
        }
      }
    }

    void loadPosts();

    return () => {
      active = false;
    };
  }, [selectedWorkspaceId, search, statusFilter, platformFilter]);

  const selectedWorkspace =
    workspaces.find((workspace) => workspace._id === selectedWorkspaceId) ??
    null;

  const location = useLocation();
  const navigate = useNavigate();

  const activePage =
    Object.entries(pagePaths).find(
      ([, path]) => path === location.pathname,
    )?.[0] ?? "Not found";

  const savedPostItems = savedPosts.map((post) => {
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

      setWorkspaces((current) => [workspace, ...current]);
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
          <div className="relative">
            <button
              type="button"
              aria-expanded={workspaceMenuOpen}
              aria-haspopup="listbox"
              disabled={workspacesLoading || workspaces.length === 0}
              onClick={() => setWorkspaceMenuOpen((open) => !open)}
              className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-200 font-bold text-amber-900">
                {(selectedWorkspace?.name ?? "W").charAt(0).toUpperCase()}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">
                  {workspacesLoading
                    ? "Loading workspaces..."
                    : (selectedWorkspace?.name ?? "No workspace yet")}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-400">
                  {workspaceError
                    ? "Unable to load workspaces"
                    : `${workspaces.length} workspace${workspaces.length === 1 ? "" : "s"}`}
                </p>
              </div>

              <ChevronDown size={16} className="shrink-0" />
            </button>

            {workspaceMenuOpen && (
              <div
                role="listbox"
                aria-label="Select workspace"
                className="absolute left-0 right-0 top-full z-50 mt-2 rounded-xl border border-white/10 bg-slate-900 p-2 shadow-xl"
              >
                {workspaces.map((workspace) => (
                  <button
                    key={workspace._id}
                    type="button"
                    role="option"
                    aria-selected={workspace._id === selectedWorkspaceId}
                    onClick={() => {
                      setSelectedWorkspaceId(workspace._id);
                      storeWorkspaceId(workspace._id);
                      setWorkspaceMenuOpen(false);
                    }}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                      workspace._id === selectedWorkspaceId
                        ? "bg-violet-500/20 text-violet-200"
                        : "text-slate-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span className="block truncate font-medium">
                      {workspace.name}
                    </span>
                    <span className="mt-1 block text-xs text-slate-400">
                      {workspace._id === selectedWorkspaceId
                        ? "Currently selected"
                        : "Switch workspace"}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setCreateWorkspaceError("");
                setNewWorkspaceName("");
                setWorkspaceMenuOpen(false);
                setCreateWorkspaceOpen(true);
              }}
              className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-violet-300 transition hover:bg-white/5 hover:text-white"
            >
              <Plus size={16} />
              Create workspace
            </button>
          </div>

          {workspaceError && (
            <p role="alert" className="mt-2 px-1 text-xs text-rose-300">
              {workspaceError}
            </p>
          )}
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
          </div>
        </header>

        <main className="mx-auto max-w-[1600px] p-4 sm:p-8">
          {notice && (
            <div
              role="status"
              className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900"
            >
              <span>{notice}</span>
              <button
                aria-label="Dismiss message"
                onClick={() => setNotice("")}
                className="rounded p-1 hover:bg-violet-100"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {activePage === "Overview" ? (
            <>
              <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                  <p className="mb-2 text-sm font-medium text-violet-600">
                    Monday, October 12
                  </p>
                  <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                    Good evening, creator <span aria-hidden="true">✦</span>
                  </h2>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500 sm:text-base">
                    Here's what's happening with your content today. Let's make
                    something worth sharing.
                  </p>
                </div>

                <button
                  onClick={() => {
                    setNotice("");
                    setCreateOpen(true);
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-700"
                >
                  <Plus size={18} />
                  Create post
                </button>
              </div>

              <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  useSharedCard
                  title="Total published"
                  value="128"
                  change="+12.8%"
                  detail="vs. last month"
                  icon={Send}
                  iconClass="bg-violet-50 text-violet-600"
                />
                <MetricCard
                  title="Scheduled posts"
                  value="08"
                  change="3 upcoming"
                  detail="Next 7 days"
                  icon={CalendarDays}
                  iconClass="bg-blue-50 text-blue-600"
                />
                <MetricCard
                  title="Drafts"
                  value={String(draftCount).padStart(2, "0")}
                  change="Keep creating"
                  detail="Ready when you are"
                  icon={FileText}
                  iconClass="bg-amber-50 text-amber-600"
                />
                <MetricCard
                  title="Engagement rate"
                  value="4.82%"
                  change="+0.6%"
                  detail="vs. last month"
                  icon={Heart}
                  iconClass="bg-rose-50 text-rose-600"
                />
              </div>

              <div className="mb-8 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Publishing activity
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Your weekly content overview
                      </p>
                    </div>
                    <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                      This week <ChevronDown size={14} />
                    </button>
                  </div>

                  <div className="mb-5 flex flex-wrap items-end gap-3">
                    <span className="text-4xl font-bold tracking-tight text-slate-950">
                      24
                    </span>
                    <span className="mb-1 flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                      <TrendingUp size={13} /> 18.4%
                    </span>
                    <span className="mb-1 text-xs text-slate-400">
                      posts published this week
                    </span>
                  </div>

                  <div
                    className="flex h-48 items-end justify-between gap-3 border-b border-slate-100 pb-3"
                    aria-label="Sample publishing activity bar chart"
                  >
                    {weeklyActivity.map((item, index) => (
                      <div
                        key={item.day}
                        className="flex h-full flex-1 flex-col items-center justify-end gap-3"
                      >
                        <div className="flex h-full w-full items-end justify-center">
                          <div
                            className={`w-full max-w-12 rounded-t-lg transition hover:opacity-75 ${
                              index === 3 ? "bg-violet-600" : "bg-violet-100"
                            }`}
                            style={{ height: `${item.height}%` }}
                            title={`${item.day}: sample activity`}
                          />
                        </div>
                        <span
                          className={`text-xs ${
                            index === 3
                              ? "font-bold text-violet-700"
                              : "text-slate-400"
                          }`}
                        >
                          {item.day}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-xs text-slate-400">
                    Illustrative activity data. Analytics will be connected
                    later.
                  </p>
                </section>

                <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-700 via-violet-600 to-indigo-600 p-6 text-white shadow-lg shadow-violet-600/10">
                  <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full border border-white/10" />
                  <div className="absolute -right-4 -top-4 h-32 w-32 rounded-full border border-white/10" />

                  <div className="relative">
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium">
                      <Sparkles size={14} /> Your creative space
                    </span>
                    <h3 className="mt-6 max-w-xs text-2xl font-bold leading-tight">
                      Great content starts with one idea.
                    </h3>
                    <p className="mt-3 max-w-sm text-sm leading-6 text-violet-100">
                      Turn your ideas into on-brand visuals and content for your
                      social channels.
                    </p>

                    <button
                      onClick={() => selectPage("Content studio")}
                      className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-violet-700 transition hover:bg-violet-50"
                    >
                      Open content studio <ArrowRight size={16} />
                    </button>
                  </div>

                  <div className="relative mt-8 grid grid-cols-3 gap-2">
                    <div className="flex h-20 items-center justify-center rounded-xl border border-white/10 bg-white/10">
                      <Image size={27} />
                    </div>
                    <div className="flex h-20 items-center justify-center rounded-xl border border-white/10 bg-white/10">
                      <Sparkles size={27} />
                    </div>
                    <div className="flex h-20 items-center justify-center rounded-xl border border-white/10 bg-white/10">
                      <MessageCircle size={27} />
                    </div>
                  </div>
                </section>
              </div>

              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5 sm:p-6">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Recent posts
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Keep track of your latest content
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select
                      aria-label="Filter posts by status"
                      value={statusFilter}
                      onChange={(event) =>
                        setStatusFilter(
                          event.target.value as
                            | "all"
                            | "draft"
                            | "scheduled"
                            | "published"
                            | "failed",
                        )
                      }
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-violet-400"
                    >
                      <option value="all">All statuses</option>
                      <option value="draft">Draft</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="published">Published</option>
                      <option value="failed">Failed</option>
                    </select>

                    <select
                      aria-label="Filter posts by platform"
                      value={platformFilter}
                      onChange={(event) =>
                        setPlatformFilter(
                          event.target.value as
                            | "all"
                            | "facebook"
                            | "instagram"
                            | "linkedin",
                        )
                      }
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-violet-400"
                    >
                      <option value="all">All platforms</option>
                      <option value="facebook">Facebook</option>
                      <option value="instagram">Instagram</option>
                      <option value="linkedin">LinkedIn</option>
                    </select>
                  </div>
                  <button
                    onClick={() => selectPage("Publishing")}
                    className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-violet-600 hover:bg-violet-50"
                  >
                    View publishing <ArrowUpRight size={16} />
                  </button>
                </div>

                {deletePostError && (
                  <div
                    role="alert"
                    className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700"
                  >
                    {deletePostError}
                  </div>
                )}

                <div className="divide-y divide-slate-100">
                  {postsLoading ? (
                    <div className="p-10 text-center text-sm text-slate-500">
                      Loading posts...
                    </div>
                  ) : postsLoadError ? (
                    <div
                      role="alert"
                      className="p-10 text-center text-sm text-rose-600"
                    >
                      Unable to load posts: {postsLoadError}
                    </div>
                  ) : filteredPosts.length === 0 ? (
                    <div className="p-10 text-center text-sm text-slate-500">
                      {search.trim()
                        ? "No posts match your search."
                        : "No posts yet. Create your first post to get started."}
                    </div>
                  ) : (
                    filteredPosts.map((post) => (
                      <div
                        key={post.id}
                        className="flex flex-wrap items-center gap-4 px-5 py-4 transition hover:bg-slate-50/70 sm:px-6"
                      >
                        <div
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${post.color}`}
                        >
                          {post.initials}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-800">
                            {post.title}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {post.platform}
                          </p>
                        </div>

                        <div className="hidden items-center gap-2 text-xs text-slate-500 md:flex">
                          <Clock3 size={14} />
                          {post.date}
                        </div>

                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            post.status === "Published"
                              ? "bg-emerald-50 text-emerald-700"
                              : post.status === "Scheduled"
                                ? "bg-blue-50 text-blue-700"
                                : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {post.status}
                        </span>

                        <div className="flex items-center gap-1">
                          {post.status === "Draft" && (
                            <button
                              type="button"
                              aria-label={`Edit draft ${post.title}`}
                              title="Edit draft"
                              onClick={() => {
                                const draft = savedPosts.find(
                                  (item) => item._id === post.id,
                                );

                                if (draft) {
                                  handleEditDraft(draft);
                                }
                              }}
                              className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                            >
                              <span className="text-xs font-medium">Edit</span>
                            </button>
                          )}
                          {post.status === "Draft" && (
                            <button
                              type="button"
                              aria-label={`Delete draft ${post.title}`}
                              title="Delete draft"
                              disabled={deletingPostId !== null}
                              onClick={() =>
                                void handleDeleteDraft(post.id, post.title)
                              }
                              className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {deletingPostId === post.id ? (
                                <span className="text-xs">Deleting...</span>
                              ) : (
                                <Trash2 size={18} />
                              )}
                            </button>
                          )}

                          <button
                            type="button"
                            aria-label={`More options for ${post.title}`}
                            onClick={() =>
                              setNotice(`Selected post: ${post.title}`)
                            }
                            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          >
                            <MoreHorizontal size={19} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                  {hasMorePosts && (
                    <div className="mt-4 flex justify-center">
                      <button
                        type="button"
                        onClick={() => void handleLoadMorePosts()}
                        disabled={loadingMorePosts}
                        className="rounded-md border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {loadingMorePosts ? "Loading..." : "Load more"}
                      </button>
                    </div>
                  )}
                </div>

                {editingPostId && (
                  <div className="border-t border-slate-100 bg-slate-50/70 p-5 sm:p-6">
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void handleSaveDraftEdit();
                      }}
                      className="mx-auto max-w-3xl space-y-5"
                    >
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">
                          Edit draft
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                          Update the title, caption, and publishing platforms.
                        </p>
                      </div>

                      {editPostError && (
                        <div
                          role="alert"
                          className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
                        >
                          {editPostError}
                        </div>
                      )}

                      <div className="space-y-2">
                        <label
                          htmlFor="edit-post-title"
                          className="block text-sm font-medium text-slate-700"
                        >
                          Title (optional)
                        </label>
                        <input
                          id="edit-post-title"
                          type="text"
                          maxLength={150}
                          value={editTitle}
                          onChange={(event) => setEditTitle(event.target.value)}
                          disabled={savingEdit}
                          placeholder="Give your draft a title"
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:opacity-60"
                        />
                      </div>

                      <div className="space-y-2">
                        <label
                          htmlFor="edit-post-caption"
                          className="block text-sm font-medium text-slate-700"
                        >
                          Caption
                        </label>
                        <textarea
                          id="edit-post-caption"
                          value={editCaption}
                          onChange={(event) =>
                            setEditCaption(event.target.value)
                          }
                          disabled={savingEdit}
                          required
                          maxLength={10000}
                          rows={5}
                          placeholder="Write your post caption..."
                          className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:opacity-60"
                        />

                        <p className="text-right text-xs text-slate-400">
                          {editCaption.length}/10000
                        </p>
                      </div>

                      <fieldset className="space-y-3">
                        <legend className="text-sm font-medium text-slate-700">
                          Publishing platforms
                        </legend>

                        <div className="flex flex-wrap gap-4">
                          {(
                            [
                              ["facebook", "Facebook"],
                              ["instagram", "Instagram"],
                              ["linkedin", "LinkedIn"],
                            ] as const
                          ).map(([platform, label]) => (
                            <label
                              key={platform}
                              className="flex items-center gap-2 text-sm text-slate-600"
                            >
                              <input
                                type="checkbox"
                                checked={editPlatforms.includes(platform)}
                                disabled={savingEdit}
                                onChange={(event) => {
                                  setEditPlatforms((current) =>
                                    event.target.checked
                                      ? [...current, platform]
                                      : current.filter(
                                          (item) => item !== platform,
                                        ),
                                  );
                                }}
                                className="h-4 w-4 rounded border-slate-300 accent-violet-600"
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                      </fieldset>

                      <div className="flex flex-wrap justify-end gap-3">
                        <button
                          type="button"
                          disabled={savingEdit}
                          onClick={() => {
                            setEditingPostId(null);
                            setEditPostError("");
                          }}
                          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                        >
                          Cancel
                        </button>

                        <button
                          type="submit"
                          disabled={savingEdit}
                          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {savingEdit ? "Saving..." : "Save changes"}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="border-t border-slate-100 px-5 py-4 sm:px-6">
                  <p className="text-xs text-slate-400">
                    Showing saved posts from this workspace.
                  </p>
                </div>
              </section>

              <footer className="flex flex-col justify-between gap-2 py-8 text-xs text-slate-400 sm:flex-row">
                <p>© 2026 Storm. Create something remarkable.</p>
                <p>Workspace · Saved content</p>
              </footer>
            </>
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
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !creatingWorkspace) {
              setCreateWorkspaceOpen(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-workspace-title"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2
                  id="create-workspace-title"
                  className="text-xl font-bold text-slate-950"
                >
                  Create a workspace
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Create a separate space for a brand, client, or team.
                </p>
              </div>

              <button
                type="button"
                aria-label="Close dialog"
                disabled={creatingWorkspace}
                onClick={() => setCreateWorkspaceOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                <X size={19} />
              </button>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleCreateWorkspace();
              }}
            >
              <label
                htmlFor="workspace-name"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                Workspace name
              </label>

              <input
                id="workspace-name"
                autoFocus
                maxLength={100}
                value={newWorkspaceName}
                onChange={(event) => {
                  setNewWorkspaceName(event.target.value);
                  setCreateWorkspaceError("");
                }}
                placeholder="e.g. Acme Marketing"
                disabled={creatingWorkspace}
                className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-50"
              />

              {createWorkspaceError && (
                <p role="alert" className="mt-2 text-sm text-rose-600">
                  {createWorkspaceError}
                </p>
              )}

              <div className="mt-5 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={creatingWorkspace}
                  onClick={() => setCreateWorkspaceOpen(false)}
                >
                  Cancel
                </Button>

                <Button
                  type="submit"
                  disabled={creatingWorkspace}
                  className="bg-violet-600 text-white hover:bg-violet-700"
                >
                  {creatingWorkspace ? "Creating..." : "Create workspace"}
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}

      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setCreateOpen(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-post-title"
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2
                  id="create-post-title"
                  className="text-xl font-bold text-slate-950"
                >
                  Create a post
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Create a draft or schedule it for later.
                </p>
                <div className="mb-5">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">
                    When should this post be saved?
                  </span>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      aria-pressed={postMode === "draft"}
                      onClick={() => {
                        setPostMode("draft");
                        setPostError("");
                      }}
                      className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${
                        postMode === "draft"
                          ? "border-violet-300 bg-violet-50 text-violet-700"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      Save as draft
                    </button>

                    <button
                      type="button"
                      aria-pressed={postMode === "scheduled"}
                      onClick={() => {
                        setPostMode("scheduled");
                        setPostError("");
                      }}
                      className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${
                        postMode === "scheduled"
                          ? "border-violet-300 bg-violet-50 text-violet-700"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      Schedule post
                    </button>
                  </div>
                </div>

                {postMode === "scheduled" && (
                  <div className="mb-5">
                    <label
                      htmlFor="post-scheduled-at"
                      className="mb-2 block text-sm font-semibold text-slate-700"
                    >
                      Publish date and time
                    </label>

                    <input
                      id="post-scheduled-at"
                      type="datetime-local"
                      value={scheduledAt}
                      min={new Date(
                        Date.now() - new Date().getTimezoneOffset() * 60_000,
                      )
                        .toISOString()
                        .slice(0, 16)}
                      onChange={(event) => {
                        setScheduledAt(event.target.value);
                        setPostError("");
                      }}
                      className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                      required
                    />

                    <p className="mt-1 text-xs text-slate-500">
                      Choose a future time in your local timezone.
                    </p>
                  </div>
                )}
              </div>
              <button
                aria-label="Close dialog"
                onClick={() => setCreateOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X size={19} />
              </button>
            </div>

            <label
              htmlFor="post-caption"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              Caption
            </label>
            <textarea
              id="post-caption"
              rows={5}
              value={caption}
              onChange={(event) => {
                setCaption(event.target.value);
                setPostError("");
              }}
              placeholder="What would you like to share with your audience?"
              className="w-full resize-y rounded-xl border border-slate-200 p-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
            />

            <fieldset className="mt-5">
              <legend className="mb-3 block text-sm font-semibold text-slate-700">
                Publishing platforms
              </legend>

              <div className="flex flex-wrap gap-4">
                {(
                  [
                    ["facebook", "Facebook"],
                    ["instagram", "Instagram"],
                    ["linkedin", "LinkedIn"],
                  ] as const
                ).map(([platform, label]) => (
                  <label
                    key={platform}
                    className="flex items-center gap-2 text-sm text-slate-600"
                  >
                    <input
                      type="checkbox"
                      checked={selectedPlatforms.includes(platform)}
                      disabled={savingPost}
                      onChange={(event) => {
                        setSelectedPlatforms((current) =>
                          event.target.checked
                            ? [...current, platform]
                            : current.filter((item) => item !== platform),
                        );
                        setPostError("");
                      }}
                      className="h-4 w-4 rounded border-slate-300 accent-violet-600"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            {postError && (
              <p role="alert" className="mt-2 text-sm text-rose-600">
                {postError}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-slate-400">
                {caption.length} characters
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-xl border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={savingPost}
                  onClick={() => void saveDraft()}
                  className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {savingPost
                    ? "Saving..."
                    : postMode === "scheduled"
                      ? "Schedule post"
                      : "Save draft"}
                </Button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  title,
  value,
  change,
  detail,
  icon: Icon,
  iconClass,
  useSharedCard = false,
}: {
  title: string;
  value: string;
  change: string;
  detail: string;
  icon: typeof Activity;
  iconClass: string;
  useSharedCard?: boolean;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl ${iconClass}`}
        >
          <Icon size={21} />
        </div>
        <button
          aria-label={`More information about ${title}`}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
          title={detail}
        >
          <MoreHorizontal size={19} />
        </button>
      </div>

      <p className="mt-5 text-sm font-medium text-slate-500">{title}</p>

      <div className="mt-2 flex flex-wrap items-baseline gap-2">
        <span className="text-3xl font-bold tracking-tight text-slate-950">
          {value}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
          {title === "Total published" || title === "Engagement rate" ? (
            <CheckCircle2 size={13} />
          ) : null}
          {change}
        </span>
      </div>

      <p className="mt-2 text-xs text-slate-400">{detail}</p>
    </>
  );

  const className =
    "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ring-0 transition hover:-translate-y-0.5 hover:shadow-md";

  if (useSharedCard) {
    return <Card className={className}>{content}</Card>;
  }

  return <section className={className}>{content}</section>;
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
