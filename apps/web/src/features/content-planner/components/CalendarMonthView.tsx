import { useState } from "react";

import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  Plus,
  ChevronRight,
  RefreshCw,
} from "lucide-react";

import type { Post } from "@/lib/posts";

import {
  getPostStatusColor,
  getPostStatusLabel,
} from "@/features/posts/utils/postStatusPresentation";

import {
  getCalendarMonthDays,
  groupCalendarPostsByDay,
} from "../utils/calendarGrid";

import { getPlannerSchedulePrefill } from "../utils/plannerDatePrefill";

type CalendarMonthViewProps = {
  year: number;
  monthIndex: number;
  posts: Post[];
  loading: boolean;
  error: string;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
  onRetry: () => void;
  onViewPost: (post: Post) => void;
  onCreateForDate: (dateKey: string) => void;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getPostTitle(post: Post): string {
  return post.title?.trim() || post.caption.trim() || "Untitled post";
}

function formatPostTime(post: Post): string {
  const timestamp =
    post.status === "published" ? post.publishedAt : post.scheduledAt;

  if (!timestamp) return "";

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CalendarMonthView({
  year,
  monthIndex,
  posts,
  loading,
  error,
  onPreviousMonth,
  onNextMonth,
  onToday,
  onRetry,
  onViewPost,
  onCreateForDate,
}: CalendarMonthViewProps) {
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  const days = getCalendarMonthDays(year, monthIndex);

  const groupedPosts = groupCalendarPostsByDay(posts);

  const monthLabel = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(new Date(year, monthIndex, 1));

  const selectedDay =
    days.find((day) => day.key === selectedDayKey && day.inCurrentMonth) ??
    null;

  const canCreateForSelectedDay =
    selectedDay !== null && getPlannerSchedulePrefill(selectedDay.key) !== null;

  const selectedPosts = selectedDay
    ? (groupedPosts.get(selectedDay.key) ?? [])
    : [];

  const displayedPosts = posts.filter((post) => {
    const timestamp =
      post.status === "published" ? post.publishedAt : post.scheduledAt;

    if (!timestamp) return false;

    const date = new Date(timestamp);

    return (
      !Number.isNaN(date.getTime()) &&
      date.getFullYear() === year &&
      date.getMonth() === monthIndex
    );
  });

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{monthLabel}</h2>

          <p className="mt-1 text-sm text-slate-500">
            {loading
              ? "Loading calendar..."
              : `${displayedPosts.length} posts this month`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToday}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Today
          </button>

          <button
            type="button"
            onClick={onPreviousMonth}
            aria-label="Previous month"
            className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50"
          >
            <ChevronLeft size={18} />
          </button>

          <button
            type="button"
            onClick={onNextMonth}
            aria-label="Next month"
            className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
        >
          <div className="flex items-center gap-2">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>

          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 font-medium hover:bg-rose-100"
          >
            <RefreshCw size={15} />
            Retry
          </button>
        </div>
      )}

      <div
        aria-busy={loading}
        className="overflow-x-auto rounded-xl border border-slate-200"
      >
        <div className="min-w-[840px]">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="px-3 py-3 text-center text-xs font-semibold uppercase text-slate-500"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {days.map((day) => {
              const dayPosts = day.inCurrentMonth
                ? (groupedPosts.get(day.key) ?? [])
                : [];

              const active = selectedDayKey === day.key && day.inCurrentMonth;

              return (
                <div
                  key={day.key}
                  className={[
                    "min-h-[132px] border-b border-r border-slate-200 p-2",
                    day.inCurrentMonth ? "bg-white" : "bg-slate-50",
                    active ? "ring-2 ring-inset ring-violet-400" : "",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    disabled={!day.inCurrentMonth}
                    onClick={() => setSelectedDayKey(day.key)}
                    aria-label={`Select ${day.date.toDateString()}`}
                    aria-pressed={active}
                    className={[
                      "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium",
                      day.isToday
                        ? "bg-violet-600 text-white"
                        : day.inCurrentMonth
                          ? "text-slate-800 hover:bg-violet-100"
                          : "text-slate-400",
                    ].join(" ")}
                  >
                    {day.dayNumber}
                  </button>

                  <div className="mt-2 space-y-1">
                    {dayPosts.slice(0, 3).map((post) => (
                      <button
                        key={post._id}
                        type="button"
                        onClick={() => onViewPost(post)}
                        title={getPostTitle(post)}
                        aria-label={`View post: ${getPostTitle(post)}`}
                        className={[
                          "block w-full rounded-md px-2 py-1 text-left text-xs",
                          "transition hover:opacity-80 focus-visible:outline-2",
                          "focus-visible:outline-offset-2 focus-visible:outline-violet-600",
                          getPostStatusColor(post.status),
                        ].join(" ")}
                      >
                        <span className="block truncate font-medium">
                          {getPostTitle(post)}
                        </span>

                        <span className="mt-0.5 block opacity-75">
                          {formatPostTime(post)}
                        </span>
                      </button>
                    ))}

                    {dayPosts.length > 3 && (
                      <button
                        type="button"
                        onClick={() => setSelectedDayKey(day.key)}
                        className="text-xs font-semibold text-violet-700 hover:underline"
                      >
                        +{dayPosts.length - 3} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {loading && (
        <p role="status" className="text-center text-sm text-slate-500">
          Loading posts for {monthLabel}...
        </p>
      )}

      {!loading && !error && displayedPosts.length === 0 && (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center">
          <CalendarDays size={30} className="text-slate-400" />
          <p className="mt-3 font-semibold">No calendar posts this month</p>
          <p className="mt-1 text-sm text-slate-500">
            Scheduled and published content will appear here.
          </p>
        </div>
      )}

      {selectedDay && (
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="font-semibold text-slate-900">
            {selectedDay.date.toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </h3>

          <div className="mt-3">
            <button
              type="button"
              onClick={() => onCreateForDate(selectedDay.key)}
              disabled={!canCreateForSelectedDay}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={16} />
              Create Post for This Date
            </button>

            {!canCreateForSelectedDay && (
              <p className="mt-2 text-xs text-slate-500">
                Select a future date with a valid scheduling time to create a
                scheduled post.
              </p>
            )}
          </div>

          {selectedPosts.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              No posts scheduled or published on this date.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {selectedPosts.map((post) => (
                <li
                  key={post._id}
                  className="rounded-lg border border-slate-200 bg-white p-3"
                >
                  <button
                    type="button"
                    onClick={() => onViewPost(post)}
                    className="block w-full rounded-lg p-3 text-left hover:bg-violet-50 focus-visible:outline-2 focus-visible:outline-violet-600"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{getPostTitle(post)}</span>

                      <span
                        className={[
                          "rounded-full px-2 py-1 text-xs font-medium",
                          getPostStatusColor(post.status),
                        ].join(" ")}
                      >
                        {getPostStatusLabel(post.status)}
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-slate-500">
                      {formatPostTime(post)}
                      {" · "}
                      {post.platforms.join(", ")}
                    </p>

                    <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-slate-600">
                      {post.caption}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </section>
  );
}
