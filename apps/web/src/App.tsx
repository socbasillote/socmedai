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

const initialPosts = [
  {
    id: 1,
    title: "A fresh look at our latest collection",
    platform: "Instagram",
    date: "Today, 10:30 AM",
    status: "Published",
    color: "bg-pink-100 text-pink-700",
    initials: "IG",
  },
  {
    id: 2,
    title: "Behind the scenes at our studio",
    platform: "Facebook",
    date: "Today, 2:00 PM",
    status: "Scheduled",
    color: "bg-blue-100 text-blue-700",
    initials: "FB",
  },
  {
    id: 3,
    title: "Three ideas to inspire your week",
    platform: "LinkedIn",
    date: "Tomorrow, 9:00 AM",
    status: "Draft",
    color: "bg-indigo-100 text-indigo-700",
    initials: "in",
  },
];

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
  const [caption, setCaption] = useState("");
  const [draftCount, setDraftCount] = useState(12);
  const [posts, setPosts] = useState(initialPosts);
  const [notice, setNotice] = useState("");

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
          setSelectedWorkspaceId((currentId) => {
            if (
              currentId &&
              result.some((workspace) => workspace._id === currentId)
            ) {
              return currentId;
            }

            return result[0]?._id ?? "";
          });
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

  const selectedWorkspace =
    workspaces.find((workspace) => workspace._id === selectedWorkspaceId) ??
    null;

  const location = useLocation();
  const navigate = useNavigate();

  const activePage =
    Object.entries(pagePaths).find(
      ([, path]) => path === location.pathname,
    )?.[0] ?? "Not found";

  const filteredPosts = posts.filter((post) =>
    `${post.title} ${post.platform} ${post.status}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  function saveDraft() {
    const text = caption.trim();

    if (!text) {
      setNotice("Enter a caption before saving your draft.");
      return;
    }

    setPosts((current) => [
      {
        id: Date.now(),
        title: text,
        platform: "Not selected",
        date: "Just now",
        status: "Draft",
        color: "bg-slate-100 text-slate-700",
        initials: "DR",
      },
      ...current,
    ]);

    setDraftCount((count) => count + 1);
    setCaption("");
    setCreateOpen(false);
    setNotice("Draft saved in this session.");
  }

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
                  <button
                    onClick={() => selectPage("Publishing")}
                    className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-violet-600 hover:bg-violet-50"
                  >
                    View publishing <ArrowUpRight size={16} />
                  </button>
                </div>

                <div className="divide-y divide-slate-100">
                  {filteredPosts.length === 0 ? (
                    <div className="p-10 text-center text-sm text-slate-500">
                      No posts match your search.
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

                        <button
                          aria-label={`More options for ${post.title}`}
                          onClick={() =>
                            setNotice(`Selected post: ${post.title}`)
                          }
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          <MoreHorizontal size={19} />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="border-t border-slate-100 px-5 py-4 sm:px-6">
                  <p className="text-xs text-slate-400">
                    Sample content for the initial dashboard. Post records are
                    not persisted to the database yet.
                  </p>
                </div>
              </section>

              <footer className="flex flex-col justify-between gap-2 py-8 text-xs text-slate-400 sm:flex-row">
                <p>© 2026 Storm. Create something remarkable.</p>
                <p>Workspace preview · Sample data</p>
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
                  Start with a caption and save it as a draft.
                </p>
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
              onChange={(event) => setCaption(event.target.value)}
              placeholder="What would you like to share with your audience?"
              className="w-full resize-y rounded-xl border border-slate-200 p-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
            />

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
                  onClick={saveDraft}
                  className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
                >
                  Save draft
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
