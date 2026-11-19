import {
  Activity,
  ArrowRight,
  CalendarDays,
  CircleHelp,
  FileText,
  Image,
  LayoutDashboard,
  Send,
  Settings,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { Link } from "react-router";
import { SidebarAccountMenu } from "@/components/SidebarAccountMenu";
import { WorkspaceSelector } from "@/components/WorkspaceSelector";
import type { ComponentProps } from "react";

type DashboardSidebarProps = {
  onNotificationClick?: () => void;
  activePage: string;
  mobileMenuOpen: boolean;
  onCloseMobileMenu: () => void;
  onSelectPage: (page: string) => void;
  workspaceSelectorProps: ComponentProps<typeof WorkspaceSelector>;
};

export function DashboardSidebar({
  onNotificationClick = () => {},
  activePage,
  mobileMenuOpen,
  onCloseMobileMenu,
  onSelectPage,
  workspaceSelectorProps,
}: DashboardSidebarProps) {
  const navigation = [
    { label: "Overview", icon: LayoutDashboard },
    { label: "Posts", icon: FileText },
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
        <div className="flex h-20 shrink-0 items-center justify-between border-b border-white/10 px-6">
          <Link
            to="/"
            className="flex min-h-11 items-center gap-3"
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
            className="min-h-11 min-w-11 rounded-lg p-2 hover:bg-white/10 lg:hidden"
            onClick={onCloseMobileMenu}
          >
            <X size={20} />
          </button>
        </div>

        <WorkspaceSelector
          {...workspaceSelectorProps}
          onWorkspaceSettings={() => onSelectPage("Workspace settings")}
        />

        <nav className="flex-1 space-y-1 min-h-0 overflow-y-auto px-2 py-4">
          {navigation.map(({ label, icon: Icon }) => {
            const active = activePage === label;

            return (
              <button
                key={label}
                onClick={() => onSelectPage(label)}
                className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-2 py-2 text-xs transition ${
                  active
                    ? "bg-violet-500/15 text-violet-300"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
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

          <div className="!mt-4 border-t border-white/10 pt-4">
            <p className="px-2 pb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
              Manage
            </p>

            <button
              onClick={() => onSelectPage("Analytics")}
              className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-2 py-2 text-xs font-normal ${
                activePage === "Analytics"
                  ? "bg-violet-500/15 text-violet-300"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <TrendingUp size={19} />
              Analytics
            </button>

            <button
              onClick={() => onSelectPage("Workspace settings")}
              className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-2 py-2 text-sm font-normal ${
                activePage === "Workspace settings"
                  ? "bg-violet-500/15 text-violet-300"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Settings size={19} />
              Workspace settings
            </button>
          </div>
        </nav>

        <div className="shrink-0 p-3">
          <button
            onClick={() => onSelectPage("Content studio")}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-white/10 bg-violet-500/15 px-2 text-sm font-semibold text-violet-200 hover:bg-violet-500/25"
          >
            <Sparkles size={18} aria-hidden="true" />
            <span className="flex-1 text-left">Create with AI</span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>

          <button className="mt-2 min-h-11 flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white">
            <CircleHelp size={18} />
            Help and support
          </button>
          <SidebarAccountMenu
            onSelectPage={onSelectPage}
            onNotificationClick={onNotificationClick}
          />
        </div>
      </aside>
    </>
  );
}
