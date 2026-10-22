import type { ComponentProps } from "react";
import { Bell, ChevronDown, Menu, Search } from "lucide-react";
import SignOutButton from "@/auth/SignOutButton";
import { LinkedInConnectionPanel } from "@/components/LinkedInConnectionPanel";

type DashboardTopBarProps = {
  activePage: string;
  workspaceName?: string;
  workspacesLoading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  onOpenNavigation: () => void;
  onNotificationClick: () => void;
  linkedInProps: ComponentProps<typeof LinkedInConnectionPanel>;
};

export function DashboardTopBar({
  activePage,
  workspaceName,
  workspacesLoading,
  search,
  onSearchChange,
  onOpenNavigation,
  onNotificationClick,
  linkedInProps,
}: DashboardTopBarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur-xl sm:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button
          aria-label="Open navigation"
          className="rounded-lg p-2 hover:bg-slate-100 lg:hidden"
          onClick={onOpenNavigation}
        >
          <Menu size={22} />
        </button>

        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">
            {workspacesLoading
              ? "Loading workspace..."
              : (workspaceName ?? "No workspace")}
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
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search posts..."
            className="w-32 bg-transparent text-sm outline-none placeholder:text-slate-400 lg:w-44"
          />

          <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-400">
            /
          </kbd>
        </label>

        <button
          aria-label="Notifications"
          onClick={onNotificationClick}
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

          <ChevronDown size={15} className="hidden text-slate-400 sm:block" />
        </button>

        <SignOutButton />

        <LinkedInConnectionPanel {...linkedInProps} />
      </div>
    </header>
  );
}
