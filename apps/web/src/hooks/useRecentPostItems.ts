import { useMemo } from "react";
import type { Post } from "@/lib/posts";
import type { RecentPostItem } from "@/components/RecentPostsList";

export function useRecentPostItems(savedPosts: Post[]): RecentPostItem[] {
  return useMemo(
    () =>
      savedPosts.map((post) => {
        const isScheduled = post.status === "scheduled";
        const displayDate = isScheduled ? post.scheduledAt : post.createdAt;

        return {
          id: post._id,
          title: post.title || post.caption,
          platform: post.platforms.join(", "),
          date: displayDate
            ? new Date(displayDate).toLocaleString()
            : "Date unavailable",
          status: post.status.charAt(0).toUpperCase() + post.status.slice(1),
          lastError: post.lastError,
          color:
            post.status === "failed"
              ? "bg-rose-100 text-rose-700"
              : post.status === "published"
                ? "bg-emerald-100 text-emerald-700"
                : post.status === "scheduled"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-violet-100 text-violet-700",
          initials: "DR",
        };
      }),
    [savedPosts],
  );
}
