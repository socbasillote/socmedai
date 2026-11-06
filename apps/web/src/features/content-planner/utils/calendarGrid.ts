import type { Post } from "@/lib/posts";

export type CalendarDay = {
  key: string;
  date: Date;
  dayNumber: number;
  inCurrentMonth: boolean;
  isToday: boolean;
};

export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * Creates a fixed six-week month grid.
 * Sunday is the first day of the week.
 */
export function getCalendarMonthDays(
  year: number,
  monthIndex: number,
  today = new Date(),
): CalendarDay[] {
  const firstOfMonth = new Date(year, monthIndex, 1);

  const firstGridDay = new Date(year, monthIndex, 1 - firstOfMonth.getDay());

  const todayKey = toLocalDateKey(today);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(
      firstGridDay.getFullYear(),
      firstGridDay.getMonth(),
      firstGridDay.getDate() + index,
    );

    const key = toLocalDateKey(date);

    return {
      key,
      date,
      dayNumber: date.getDate(),
      inCurrentMonth:
        date.getFullYear() === year && date.getMonth() === monthIndex,
      isToday: key === todayKey,
    };
  });
}

/**
 * Determines which date a post occupies.
 *
 * This matches the backend calendar query policy.
 */
export function getCalendarPostDate(post: Post): Date | null {
  const timestamp =
    post.status === "published"
      ? post.publishedAt
      : post.status === "scheduled" ||
          post.status === "publishing" ||
          post.status === "failed"
        ? post.scheduledAt
        : undefined;

  if (!timestamp) {
    return null;
  }

  const date = new Date(timestamp);

  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Group posts by local date without mutating input.
 */
export function groupCalendarPostsByDay(
  posts: readonly Post[],
): Map<string, Post[]> {
  const grouped = new Map<string, Post[]>();

  for (const post of posts) {
    const date = getCalendarPostDate(post);

    if (!date) continue;

    const key = toLocalDateKey(date);
    const items = grouped.get(key) ?? [];

    items.push(post);
    grouped.set(key, items);
  }

  for (const items of grouped.values()) {
    items.sort((a, b) => {
      const first = getCalendarPostDate(a)?.getTime() ?? 0;
      const second = getCalendarPostDate(b)?.getTime() ?? 0;

      return first - second || a._id.localeCompare(b._id);
    });
  }

  return grouped;
}
