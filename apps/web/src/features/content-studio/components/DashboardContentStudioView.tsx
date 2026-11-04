import type { ComponentProps } from "react";

import { ContentStudio } from "@/components/ContentStudio";

/**
 * Reuse the actual ContentStudio prop contract
 * instead of maintaining duplicate interfaces.
 */
type ContentStudioProps = ComponentProps<typeof ContentStudio>;

type DashboardContentStudioViewProps = {
  selectedWorkspaceId: ContentStudioProps["selectedWorkspaceId"];

  linkedInConnectionId: ContentStudioProps["linkedInConnectionId"];

  linkedInDisplayName: ContentStudioProps["linkedInDisplayName"];

  linkedInStatus: ContentStudioProps["linkedInStatus"];

  onPostSaved: ContentStudioProps["onPostSaved"];
};

/**
 * Dashboard integration adapter for Content Studio.
 *
 * Responsibilities:
 * - Receive workspace and connection context.
 * - Pass existing context to ContentStudio.
 * - Forward saved-post events to the parent.
 *
 * Does not:
 * - Generate or revise captions.
 * - Fetch social connections.
 * - Save posts directly.
 * - Own workspace selection.
 */
export function DashboardContentStudioView({
  selectedWorkspaceId,
  linkedInConnectionId,
  linkedInDisplayName,
  linkedInStatus,
  onPostSaved,
}: DashboardContentStudioViewProps) {
  return (
    <ContentStudio
      selectedWorkspaceId={selectedWorkspaceId}
      linkedInConnectionId={linkedInConnectionId}
      linkedInDisplayName={linkedInDisplayName}
      linkedInStatus={linkedInStatus}
      onPostSaved={onPostSaved}
    />
  );
}
