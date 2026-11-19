import { useEffect, useId, useRef, useState, type ComponentProps } from "react";
import { Bell, ChevronDown, Menu } from "lucide-react";
import { useAuth } from "@/auth/useAuth";
import SignOutButton from "@/auth/SignOutButton";
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
  activePage, workspaceName, workspacesLoading, onOpenNavigation,
  onNotificationClick, linkedInProps, facebookProps,
}: DashboardTopBarProps) {
  const { user } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const profileTriggerRef = useRef<HTMLButtonElement>(null);
  const profileId = useId();
  const metadataName = user?.user_metadata?.full_name ?? user?.user_metadata?.name;
  const displayName = typeof metadataName === "string" && metadataName.trim()
    ? metadataName.trim() : user?.email?.split("@")[0] || "Account";
  const words = displayName.split(/\s+/);
  const initials = (words.length > 1 ? words.slice(0, 2).map((word) => word[0]).join("") : displayName.slice(0, 2)).toUpperCase();

  useEffect(() => {
    if (!profileOpen) return;
    function closeOutside(event: Event) {
      if (event.target instanceof Node && !profileRef.current?.contains(event.target)) setProfileOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setProfileOpen(false);
        profileTriggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("focusin", closeOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [profileOpen]);

  return (
    <header className="sticky top-0 z-20 flex min-h-20 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <button type="button" aria-label="Open navigation" className="shrink-0 rounded-lg p-2 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-violet-500 lg:hidden" onClick={onOpenNavigation}>
          <Menu size={22} aria-hidden="true" />
        </button>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-slate-500" title={workspaceName}>
            {workspacesLoading ? "Loading workspace..." : workspaceName ?? "No workspace"}
            <span className="hidden sm:inline"> / Workspace</span>
          </p>
          <h1 className="mt-1 truncate text-lg font-bold tracking-tight sm:text-xl">{activePage}</h1>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 lg:gap-3">
        {facebookProps && <SocialConnectionsMenu linkedInProps={linkedInProps} facebookProps={facebookProps} />}
        <div ref={profileRef} className="relative shrink-0">
          <button ref={profileTriggerRef} type="button" aria-label="User profile" aria-expanded={profileOpen} aria-controls={profileId}
            onClick={() => setProfileOpen((open) => !open)}
            className="flex items-center gap-1 rounded-xl p-1 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-violet-500">
            <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-700">{initials}</span>
            <ChevronDown size={15} aria-hidden="true" className="hidden text-slate-400 sm:block" />
          </button>
          {profileOpen && <section id={profileId} aria-label="Your account"
            className="fixed inset-x-4 top-20 z-50 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-72">
            <h2 className="break-words text-sm font-semibold text-slate-900">{displayName}</h2>
            {user?.email && <p className="mt-1 break-all text-xs text-slate-500">{user.email}</p>}
            <button type="button" onClick={() => { setProfileOpen(false); profileTriggerRef.current?.focus(); onNotificationClick(); }}
              className="my-4 flex w-full items-center gap-2 rounded-lg p-2 text-sm text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-violet-500">
              <Bell size={18} aria-hidden="true" />Notifications
            </button>
            {!facebookProps && <div className="mb-4 flex flex-wrap gap-2"><LinkedInConnectionPanel {...linkedInProps} /></div>}
            <SignOutButton />
          </section>}
        </div>
      </div>
    </header>
  );
}
