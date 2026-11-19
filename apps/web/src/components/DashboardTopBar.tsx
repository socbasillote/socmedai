import { type ComponentProps } from "react";
import { Menu } from "lucide-react";
import { LinkedInConnectionPanel } from "@/components/LinkedInConnectionPanel";
import { SocialConnectionsMenu } from "@/components/SocialConnectionsMenu";

type DashboardTopBarProps = {
  activePage: string;
  workspaceName?: string;
  workspacesLoading: boolean;
  onOpenNavigation: () => void;
  onNotificationClick: () => void;
  linkedInProps: ComponentProps<typeof LinkedInConnectionPanel>;
  facebookProps?: ComponentProps<typeof SocialConnectionsMenu>["facebookProps"];
};

export function DashboardTopBar({
  activePage,
  workspaceName,
  workspacesLoading,
  onOpenNavigation,
  linkedInProps,
  facebookProps,
}: DashboardTopBarProps) {
  return (
    <header className="sticky top-0 z-20 flex min-h-20 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <button
          type="button"
          aria-label="Open navigation"
          className="min-h-11 min-w-11 shrink-0 rounded-lg p-2 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-violet-500 lg:hidden"
          onClick={onOpenNavigation}
        >
          <Menu size={22} aria-hidden="true" />
        </button>
        <div className="min-w-0">
          <p
            className="truncate text-xs font-normal text-slate-500"
            title={workspaceName}
          >
            {workspacesLoading
              ? "Loading workspace..."
              : (workspaceName ?? "No workspace")}
            <span className="hidden sm:inline"> / Workspace</span>
          </p>
          <h1 className="mt-1 truncate text-lg font-bold tracking-tight sm:text-xl">
            {activePage}
          </h1>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 lg:gap-3">
        {facebookProps && (
          <SocialConnectionsMenu
            linkedInProps={linkedInProps}
            facebookProps={facebookProps}
          />
        )}
        {!facebookProps && <LinkedInConnectionPanel {...linkedInProps} />}
      </div>
    </header>
  );
}
