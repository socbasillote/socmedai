import {
  Activity,
  ArrowRight,
  CalendarDays,
  CircleHelp,
  Image,
  LayoutDashboard,
  Send,
  Settings,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { Link } from "react-router";
import { WorkspaceSelector } from "@/components/WorkspaceSelector";
import type { ComponentProps } from "react";

type DashboardSidebarProps = {
  activePage: string;
  mobileMenuOpen: boolean;
  onCloseMobileMenu: () => void;
  onSelectPage: (page: string) => void;
  workspaceSelectorProps: ComponentProps<typeof WorkspaceSelector>;
};

export function DashboardSidebar({
  activePage,
  mobileMenuOpen,
  onCloseMobileMenu,
  onSelectPage,
  workspaceSelectorProps,
}: DashboardSidebarProps) {
  const navigation = [
    { label: "Overview", icon: LayoutDashboard },
    { label: "Content calendar", icon: CalendarDays },
    { label: "Content studio", icon: Sparkles },
    { label: "Media library", icon: Image },
    { label: "Publishing", icon: Send },
  ];

  return (
    <>
      {mobileMenuOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden"
          onClick={onCloseMobileMenu}
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
            onClick={() => onSelectPage("Overview")}
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
            onClick={onCloseMobileMenu}
          >
            <X size={20} />
          </button>
        </div>

        <WorkspaceSelector {...workspaceSelectorProps} />

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-6">
          <p className="px-3 pb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
            Workspace
          </p>

          {navigation.map(({ label, icon: Icon }) => {
            const active = activePage === label;

            return (
              <button
                key={label}
                onClick={() => onSelectPage(label)}
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
              onClick={() => onSelectPage("Analytics")}
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
              onClick={() => onSelectPage("Settings")}
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
              onClick={() => onSelectPage("Content studio")}
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
    </>
  );
}
