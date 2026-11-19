import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { DashboardTopBar } from "./DashboardTopBar";
vi.mock("@/auth/useAuth", () => ({ useAuth: () => ({ user: { email: "maria@example.com", user_metadata: { full_name: "Maria Santos" } } }) }));
vi.mock("@/auth/SignOutButton", () => ({ default: () => <button>Sign out</button> }));
vi.mock("@/components/SocialConnectionsMenu", () => ({ SocialConnectionsMenu: () => <button>Social Accounts</button> }));
vi.mock("@/components/LinkedInConnectionPanel", () => ({ LinkedInConnectionPanel: () => <button>Connect LinkedIn</button> }));
afterEach(cleanup);
function topbar() {
 const onNotificationClick = vi.fn(), onOpenNavigation = vi.fn();
 render(<DashboardTopBar activePage="Overview" workspaceName="A very long workspace name" workspacesLoading={false}
   onNotificationClick={onNotificationClick} onOpenNavigation={onOpenNavigation}
   linkedInProps={{} as ComponentProps<typeof DashboardTopBar>["linkedInProps"]}
   facebookProps={{} as ComponentProps<typeof DashboardTopBar>["facebookProps"]} />);
 return { onNotificationClick, onOpenNavigation };
}
it("removes the search input and shortcut hint", () => {
 topbar(); expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
 expect(screen.queryByText("/")).not.toBeInTheDocument();
});
it("opens real account details and groups notifications and sign-out inside", () => {
 topbar();
 expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
 expect(screen.getByText("MS")).toBeInTheDocument();
 const trigger = screen.getByRole("button", { name: "User profile" });
 fireEvent.click(trigger);
 expect(trigger).toHaveAttribute("aria-expanded", "true");
 expect(screen.getByRole("region", { name: "Your account" })).toHaveTextContent("Maria Santos");
 expect(screen.getByText("maria@example.com")).toBeInTheDocument();
 expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
});
it("closes the profile with Escape and restores focus", () => {
 topbar(); const trigger = screen.getByRole("button", { name: "User profile" });
 fireEvent.click(trigger); fireEvent.keyDown(document, { key: "Escape" });
 expect(screen.queryByRole("region", { name: "Your account" })).not.toBeInTheDocument();
 expect(trigger).toHaveFocus();
});
it("closes when clicking or focusing outside", () => {
 topbar(); const trigger = screen.getByRole("button", { name: "User profile" });
 fireEvent.click(trigger); fireEvent.pointerDown(document.body);
 expect(trigger).toHaveAttribute("aria-expanded", "false");
 fireEvent.click(trigger); fireEvent.focusIn(screen.getByRole("button", { name: "Social Accounts" }));
 expect(trigger).toHaveAttribute("aria-expanded", "false");
});
it("retains working navigation and notifications", () => {
 const { onOpenNavigation, onNotificationClick } = topbar();
 fireEvent.click(screen.getByRole("button", { name: "Open navigation" })); expect(onOpenNavigation).toHaveBeenCalledOnce();
 fireEvent.click(screen.getByRole("button", { name: "User profile" }));
 fireEvent.click(screen.getByRole("button", { name: "Notifications" })); expect(onNotificationClick).toHaveBeenCalledOnce();
 expect(screen.queryByRole("region", { name: "Your account" })).not.toBeInTheDocument();
});
