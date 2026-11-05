import type { Post } from "@/lib/posts";

import type { RecentPostItem } from "@/components/RecentPostsList";

import { formatLocalDateTime } from "@/shared/utils/dateFormat";

import {
  getPostStatusLabel,
  getPostStatusColor,
} from "@/features/posts/utils/postStatusPresentation";
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

  return {
    id: post._id,
    title: post.title || post.caption,
    platform: post.platforms.join(", "),
    date: displayDate
      ? formatLocalDateTime(new Date(displayDate))
      : "Date unavailable",

    status: getPostStatusLabel(post.status),
    lastError: post.lastError,
    color: getPostStatusColor(post.status),
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
