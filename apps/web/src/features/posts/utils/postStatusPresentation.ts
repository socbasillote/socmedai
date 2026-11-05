import type { Post } from "@/lib/posts";

type PostStatus = Post["status"];

/**
 * Converts a post status to the label currently
 * displayed in Storm's Posts and Overview views.
 *
 * Preserve existing capitalization behavior.
 */
export function getPostStatusLabel(status: PostStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/**
 * Returns the existing Tailwind classes for
 * each post status.
 *
 * The default preserves existing violet styling
 * for statuses without an explicit mapping.
 */
export function getPostStatusColor(status: PostStatus): string {
  switch (status) {
    case "failed":
      return "bg-rose-100 text-rose-700";

    case "published":
      return "bg-emerald-100 text-emerald-700";

    case "scheduled":
      return "bg-blue-100 text-blue-700";

    default:
      return "bg-violet-100 text-violet-700";
  }
}
