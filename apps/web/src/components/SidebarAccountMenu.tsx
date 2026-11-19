import { useId, useState } from "react";
import { Bell, ChevronUp, Settings, UserRound } from "lucide-react";
import { useAuth } from "@/auth/useAuth";
import SignOutButton from "@/auth/SignOutButton";
import { useSidebarDropdown } from "@/hooks/useSidebarDropdown";

type Props = {
  onSelectPage: (page: string) => void;
  onNotificationClick: () => void;
};
export function SidebarAccountMenu({
  onSelectPage,
  onNotificationClick,
}: Props) {
  const { user } = useAuth();
  const name = user?.user_metadata?.full_name ?? user?.user_metadata?.name;
  const displayName =
    typeof name === "string" && name.trim()
      ? name.trim()
      : user?.email?.split("@")[0] || "My account";
  const initials =
    displayName.split(/\s+/).length > 1
      ? displayName
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part[0])
          .join("")
          .toUpperCase()
      : displayName.slice(0, 2).toUpperCase();
  const [open, setOpen] = useState(false);
  const {
    root: rootRef,
    trigger: triggerRef,
    close: closeMenu,
    onKeyDown,
    onTriggerFocus,
  } = useSidebarDropdown(open, setOpen);
  const id = useId();
  const itemClass =
    "flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left text-sm text-slate-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-violet-400";
  function select(page: string) {
    closeMenu();
    onSelectPage(page);
  }
  return (
    <div
      ref={rootRef}
      onKeyDown={onKeyDown}
      className="relative mt-2 border-t border-white/10 pt-2"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setOpen(true);
      }}
      onPointerLeave={(event) => {
        if (
          event.pointerType === "mouse" &&
          !event.currentTarget.contains(document.activeElement)
        )
          setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label="My account"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onFocus={onTriggerFocus}
        onClick={() => setOpen(true)}
        className="flex min-h-16 w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-violet-400"
      >
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-sm font-semibold text-violet-200"
        >
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white">
            My account
          </span>
          <span className="block text-xs text-slate-400">
            Profile &amp; settings
          </span>
        </span>
        <ChevronUp size={16} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={id}
          role="menu"
          aria-label="My account"
          className="absolute bottom-full left-0 z-50 max-h-[calc(100dvh-6rem)] w-full overflow-y-auto rounded-xl border border-white/10 bg-slate-900 p-2 shadow-2xl"
        >
          <p
            className="truncate px-2 py-2 text-xs text-slate-400"
            title={user?.email}
          >
            {user?.email}
          </p>
          <button
            role="menuitem"
            data-dropdown-item
            type="button"
            className={itemClass}
            onClick={() => select("User settings")}
          >
            <Settings size={18} aria-hidden="true" />
            User settings
          </button>
          <button
            role="menuitem"
            data-dropdown-item
            type="button"
            className={itemClass}
            onClick={() => select("Profile")}
          >
            <UserRound size={18} aria-hidden="true" />
            Profile
          </button>
          <button
            role="menuitem"
            data-dropdown-item
            type="button"
            className={itemClass}
            onClick={() => {
              closeMenu();
              onNotificationClick();
            }}
          >
            <Bell size={18} aria-hidden="true" />
            Notifications
          </button>
          <div role="separator" className="my-2 border-t border-white/10" />
          <SignOutButton menuItem />
        </div>
      )}
    </div>
  );
}
