import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

type PagePaths = Record<string, string>;

type UseDashboardNavigationOptions = {
  pagePaths: PagePaths;
};

export function useDashboardNavigation({
  pagePaths,
}: UseDashboardNavigationOptions) {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const activePage =
    Object.entries(pagePaths).find(
      ([, path]) => path === location.pathname,
    )?.[0] ?? "Not found";

  function selectPage(label: string) {
    navigate(pagePaths[label] ?? "/");
    setMobileMenuOpen(false);
  }

  function openNavigation() {
    setMobileMenuOpen(true);
  }

  function closeNavigation() {
    setMobileMenuOpen(false);
  }

  return {
    activePage,
    mobileMenuOpen,
    selectPage,
    openNavigation,
    closeNavigation,
  };
}
