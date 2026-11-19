import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { DashboardTopBar } from "./DashboardTopBar";
vi.mock("@/components/SocialConnectionsMenu", () => ({ SocialConnectionsMenu: () => <button>Social Accounts</button> }));
vi.mock("@/components/LinkedInConnectionPanel", () => ({ LinkedInConnectionPanel: () => <button>Connect LinkedIn</button> }));
afterEach(cleanup);
it("keeps navigation and social connections while removing the top-bar account avatar", () => {
  const onOpenNavigation = vi.fn();
  render(<DashboardTopBar activePage="Overview" workspaceName="Studio" workspacesLoading={false} onOpenNavigation={onOpenNavigation} onNotificationClick={vi.fn()}
    linkedInProps={{} as ComponentProps<typeof DashboardTopBar>["linkedInProps"]} facebookProps={{} as ComponentProps<typeof DashboardTopBar>["facebookProps"]} />);
  expect(screen.queryByRole("button", { name: "User profile" })).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Social Accounts" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
  expect(onOpenNavigation).toHaveBeenCalledOnce();
});
