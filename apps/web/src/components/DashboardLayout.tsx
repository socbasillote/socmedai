import type { ReactNode, ComponentProps } from "react";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { DashboardTopBar } from "@/components/DashboardTopBar";
import { PageContent } from "@/components/PageContent";

type DashboardLayoutProps = {
  activePage: string;
  mobileMenuOpen: boolean;
  onCloseMobileMenu: () => void;
  onSelectPage: (page: string) => void;
  workspaceSelectorProps: ComponentProps<
    typeof DashboardSidebar
  >["workspaceSelectorProps"];
  workspaceName?: string;
  workspacesLoading: boolean;
  onOpenNavigation: () => void;
  onNotificationClick: () => void;
  linkedInProps: ComponentProps<typeof DashboardTopBar>["linkedInProps"];
  facebookProps?: ComponentProps<typeof DashboardTopBar>["facebookProps"];
  notice: string;
  onDismissNotice: () => void;
  children: ReactNode;
};

export function DashboardLayout({
  activePage,
  mobileMenuOpen,
  onCloseMobileMenu,
  onSelectPage,
  workspaceSelectorProps,
  workspaceName,
  workspacesLoading,
  onOpenNavigation,
  onNotificationClick,
  linkedInProps,
  facebookProps,
  notice,
  onDismissNotice,
  children,
}: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <DashboardSidebar
        onNotificationClick={onNotificationClick}
        activePage={activePage}
        mobileMenuOpen={mobileMenuOpen}
        onCloseMobileMenu={onCloseMobileMenu}
        onSelectPage={onSelectPage}
        workspaceSelectorProps={workspaceSelectorProps}
      />

      <div className="min-h-screen lg:pl-64">
        <DashboardTopBar
          activePage={activePage}
          workspaceName={workspaceName}
          workspacesLoading={workspacesLoading}
          onOpenNavigation={onOpenNavigation}
          onNotificationClick={onNotificationClick}
          linkedInProps={linkedInProps}
          facebookProps={facebookProps}
        />

        <PageContent notice={notice} onDismissNotice={onDismissNotice}>
          {children}
        </PageContent>
      </div>
    </div>
  );
}
