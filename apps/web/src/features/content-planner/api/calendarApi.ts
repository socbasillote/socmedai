import { apiFetch } from "@/lib/api";
import type { Post } from "@/lib/posts";

export type CalendarDateRange = {
  start: string;
  end: string;
};

export type CalendarPostsResponse = {
  posts: Post[];
  range: CalendarDateRange;
};

/**
 * Fetch calendar posts for one authorized workspace.
 *
 * The backend is responsible for authorization
 * and date-range validation.
 */
export async function getWorkspaceCalendarPosts(
  workspaceId: string,
  range: CalendarDateRange,
): Promise<CalendarPostsResponse> {
  const params = new URLSearchParams({
    start: range.start,
    end: range.end,
  });

  const path =
    `/api/posts/workspaces/` +
    `${encodeURIComponent(workspaceId)}/calendar` +
    `?${params.toString()}`;

  return apiFetch<CalendarPostsResponse>(path);
}
