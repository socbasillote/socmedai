import type { ComponentProps } from "react";

import { PagePlaceholder } from "@/components/PagePlaceholder";

type PlaceholderProps = ComponentProps<typeof PagePlaceholder>;

/**
 * Presentation adapter for dashboard
 * pages that are not yet implemented.
 *
 * Keeps placeholder rendering separate
 * from DashboardPage composition.
 */
export function DashboardPlaceholderView({
  activePage,
  onReturnToOverview,
}: PlaceholderProps) {
  return (
    <PagePlaceholder
      activePage={activePage}
      onReturnToOverview={onReturnToOverview}
    />
  );
}
