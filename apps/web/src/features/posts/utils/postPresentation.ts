import type { Post } from "@/lib/posts";

import type { RecentPostItem } from "@/components/RecentPostsList";

/**
 * Pure presentation utility.
 *
 * Converts a backend Post into the existing
 * RecentPostsList display model.
 *
 * No React state or API calls belong here.
 */
export function toRecentPostItem(post: Post): RecentPostItem {
  const isScheduled = post.status === "scheduled";

  const displayDate = isScheduled ? post.scheduledAt : post.createdAt;

  const color =
    post.status === "failed"
      ? "bg-rose-100 text-rose-700"
      : post.status === "published"
        ? "bg-emerald-100 text-emerald-700"
        : post.status === "scheduled"
          ? "bg-blue-100 text-blue-700"
          : "bg-violet-100 text-violet-700";

  return {
    id: post._id,
    title: post.title || post.caption,
    platform: post.platforms.join(", "),
    date: displayDate
      ? new Date(displayDate).toLocaleString()
      : "Date unavailable",
    status: post.status.charAt(0).toUpperCase() + post.status.slice(1),
    lastError: post.lastError,
    color,
    initials: "DR",
  };
}

/**
 * Converts a collection of posts without
 * mutating the original array.
 */
export function toRecentPostItems(posts: readonly Post[]): RecentPostItem[] {
  return posts.map(toRecentPostItem);
}
