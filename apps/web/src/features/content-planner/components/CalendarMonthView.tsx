import { useRef, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  X,
  RefreshCw,
} from "lucide-react";
import { Dialog } from "@base-ui/react/dialog";
import { FaFacebook, FaInstagram, FaLinkedin } from "react-icons/fa6";
import type { Post } from "@/lib/posts";
import { getPostStatusLabel } from "@/features/posts/utils/postStatusPresentation";
import {
  getCalendarMonthDays,
  getCalendarPostDate,
  getCalendarWeekDays,
  groupCalendarPostsByDay,
} from "../utils/calendarGrid";

type CalendarMonthViewProps = {
  year: number;
  monthIndex: number;
  view?: "month" | "week" | "list";
  weekAnchor?: Date;
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
const platformIcons = {
  linkedin: FaLinkedin,
  facebook: FaFacebook,
  instagram: FaInstagram,
};
const statusStyles: Record<string, string> = {
  published:
    "rounded-md border border-emerald-100 bg-emerald-50 text-emerald-700",
  draft:
    "rounded-md border border-dashed border-amber-500 bg-amber-50 text-amber-900",
  scheduled:
    "rounded-xl border border-blue-200 border-l-4 border-l-blue-600 bg-blue-50 text-blue-900",
  publishing:
    "rounded-xl border border-blue-200 border-l-4 border-l-blue-600 bg-blue-50 text-blue-900",
  failed: "rounded-md border-2 border-rose-600 bg-rose-50 text-rose-900",
  unknown: "rounded-md border-2 border-rose-600 bg-rose-50 text-rose-900",
};
const navigationButton =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-300 px-2 text-sm font-normal text-slate-700 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-violet-600";

function getPostTitle(post: Post): string {
  return post.title?.trim() || post.caption.trim() || "Untitled post";
}

function PostChip({
  post,
  onView,
}: {
  post: Post;
  onView: (post: Post) => void;
}) {
  const date = getCalendarPostDate(post);
  const time =
    date?.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) ?? "";
  const status = getPostStatusLabel(post.status);
  return (
    <button
      type="button"
      onClick={() => onView(post)}
      title={`${status}: ${getPostTitle(post)}${date ? ` · ${date.toLocaleString()}` : ""}`}
      aria-label={`View ${status.toLowerCase()} post: ${getPostTitle(post)}, ${time}`}
      className={`relative block min-h-11 w-full min-w-0 px-2 py-1.5 text-left text-xs transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 ${statusStyles[post.status]}`}
    >
      <span className="flex items-center gap-1.5">
        {post.platforms.map((platform) => {
          const Icon = platformIcons[platform];
          return Icon ? (
            <Icon
              key={platform}
              size={13}
              className="shrink-0"
              aria-label={platform === "linkedin" ? "LinkedIn" : platform}
            />
          ) : null;
        })}
        <time dateTime={date?.toISOString()} className="truncate font-medium">
          {time}
        </time>
        <span className="sr-only">{status}</span>
      </span>
      <span className="mt-1 block truncate font-normal text-sm">
        {getPostTitle(post)}
      </span>
    </button>
  );
}

export function CalendarMonthView({
  year,
  monthIndex,
  view = "month",
  weekAnchor,
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
  const detailsHeading = useRef<HTMLHeadingElement>(null);
  const dayTrigger = useRef<HTMLButtonElement>(null);
  const days =
    view === "week"
      ? getCalendarWeekDays(weekAnchor ?? new Date(year, monthIndex, 1))
      : getCalendarMonthDays(year, monthIndex);
  const groupedPosts = groupCalendarPostsByDay(posts);
  const visibleDays = days.filter(
    (day) => view === "week" || day.inCurrentMonth,
  );
  const visibleKeys = new Set(visibleDays.map((day) => day.key));
  const displayedPosts = visibleDays.flatMap(
    (day) => groupedPosts.get(day.key) ?? [],
  );
  const counts = {
    published: displayedPosts.filter((post) => post.status === "published")
      .length,
    draft: displayedPosts.filter((post) => post.status === "draft").length,
    scheduled: displayedPosts.filter((post) => post.status === "scheduled")
      .length,
  };
  const monthLabel = new Date(year, monthIndex, 1).toLocaleDateString(
    undefined,
    { month: "long", year: "numeric" },
  );
  const periodLabel =
    view === "week"
      ? `${days[0].date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} – ${days[6].date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
      : monthLabel;
  const selectedDay = days.find(
    (day) => day.key === selectedDayKey && visibleKeys.has(day.key),
  );
  const selectedPosts = selectedDay
    ? (groupedPosts.get(selectedDay.key) ?? [])
    : [];

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="flex items-center gap-1.5"
            role="group"
            aria-label="Calendar navigation"
          >
            <button
              type="button"
              onClick={onPreviousMonth}
              aria-label={view === "week" ? "Previous week" : "Previous month"}
              className={navigationButton}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={onToday}
              className={navigationButton}
            >
              Today
            </button>
            <button
              type="button"
              onClick={onNextMonth}
              aria-label={view === "week" ? "Next week" : "Next month"}
              className={navigationButton}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <h2 className="text-lg font-bold text-slate-900 sm:text-xl">
            {periodLabel}
          </h2>
        </div>
        <p role="status" className="whitespace-nowrap text-sm text-slate-600">
          {loading
            ? "Loading calendar..."
            : `${counts.published} published · ${counts.draft} drafts · ${counts.scheduled} scheduled`}
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
        <ul
          aria-label="Calendar legend"
          className="flex flex-wrap items-center gap-4"
        >
          {(["published", "draft", "scheduled"] as const).map((status) => (
            <li key={status} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`h-4 w-6 ${statusStyles[status]}`}
              />
              {getPostStatusLabel(status)}
            </li>
          ))}
          <li className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-4 w-6 rounded border border-violet-500 bg-violet-50"
            />
            Today
          </li>
        </ul>
        <p>Click an empty calendar day to create a new post.</p>
      </div>

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
        >
          <span className="flex items-center gap-2">
            <AlertCircle size={18} />
            {error}
          </span>
          <button
            type="button"
            onClick={onRetry}
            className={`${navigationButton} gap-2`}
          >
            <RefreshCw size={15} />
            Retry
          </button>
        </div>
      )}

      {view === "list" ? (
        <div aria-busy={loading} className="space-y-4">
          {visibleDays
            .filter((day) => groupedPosts.has(day.key))
            .map((day) => (
              <section
                key={day.key}
                className="rounded-xl border border-slate-200 p-4"
              >
                <h3 className="mb-3 text-sm font-semibold text-slate-800">
                  {day.date.toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
                </h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {groupedPosts.get(day.key)!.map((post) => (
                    <PostChip key={post._id} post={post} onView={onViewPost} />
                  ))}
                </div>
              </section>
            ))}
        </div>
      ) : (
        <div
          aria-busy={loading}
          className="overflow-x-auto rounded-xl border border-slate-200"
        >
          <div className="min-w-[700px] ">
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
              {WEEKDAYS.map((day) => (
                <div
                  key={day}
                  className="px-2 py-2 text-center text-xs font-semibold uppercase text-slate-600"
                >
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const available = view === "week" || day.inCurrentMonth;
                const dayPosts = available
                  ? (groupedPosts.get(day.key) ?? [])
                  : [];
                const active = selectedDayKey === day.key;
                const weekend =
                  day.date.getDay() === 0 || day.date.getDay() === 6;
                return (
                  <div
                    key={day.key}
                    data-date={day.key}
                    aria-current={day.isToday ? "date" : undefined}
                    className={`relative min-h-[180px] min-w-0 border-b border-r border-slate-200 p-2 ${
                      day.isToday
                        ? "bg-violet-50 ring-2 ring-inset ring-violet-500"
                        : !day.inCurrentMonth
                          ? "bg-slate-100 text-slate-500"
                          : weekend
                            ? "bg-slate-50"
                            : "bg-white"
                    } ${active && !day.isToday ? "ring-2 ring-inset ring-violet-400" : ""}`}
                  >
                    {dayPosts.length === 0 ? (
                      <button
                        type="button"
                        disabled={!available || loading || Boolean(error)}
                        aria-label={`Create post for ${day.date.toDateString()}`}
                        onClick={() => onCreateForDate(day.key)}
                        className="absolute inset-0 flex min-h-11 min-w-11 items-start rounded-sm p-2 text-left transition enabled:hover:bg-violet-100/50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-violet-600 disabled:cursor-default"
                      >
                        <span
                          className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-normal ${day.isToday ? "bg-violet-600 text-white" : day.inCurrentMonth ? "text-slate-800" : "text-slate-500"}`}
                        >
                          {day.dayNumber}
                        </span>
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={(event) => {
                            dayTrigger.current = event.currentTarget;
                            setSelectedDayKey(day.key);
                          }}
                          aria-label={`Select ${day.date.toDateString()}`}
                          aria-pressed={active}
                          className={`flex min-h-11 min-w-11 items-center justify-center rounded-full text-sm font-normal focus-visible:outline-2 focus-visible:outline-violet-600 ${day.isToday ? "bg-violet-600 text-white" : "text-slate-800 hover:bg-violet-100"}`}
                        >
                          {day.dayNumber}
                        </button>
                        <div className="mt-1 space-y-1">
                          {dayPosts.slice(0, 2).map((post) => (
                            <PostChip
                              key={post._id}
                              post={post}
                              onView={onViewPost}
                            />
                          ))}
                          {dayPosts.length > 2 && (
                            <button
                              type="button"
                              onClick={(event) => {
                                dayTrigger.current = event.currentTarget;
                                setSelectedDayKey(day.key);
                              }}
                              aria-haspopup="dialog"
                              aria-controls="calendar-day-details"
                              aria-label={`Show ${dayPosts.length - 2} more posts for ${day.date.toDateString()}`}
                              className="flex min-h-11 min-w-11 items-center rounded-md px-1 text-xs font-semibold text-violet-700 hover:underline focus-visible:outline-2 focus-visible:outline-violet-600"
                            >
                              +{dayPosts.length - 2} more
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {!loading && !error && displayedPosts.length === 0 && (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center">
          <CalendarDays size={30} className="text-slate-600" />
          <p className="mt-3 font-semibold">
            No calendar posts this {view === "week" ? "week" : "month"}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Published posts and posts with a planned date, including drafts,
            appear here.
          </p>
        </div>
      )}

      <Dialog.Root
        open={Boolean(selectedDay) && view !== "list"}
        onOpenChange={(open) => {
          if (!open) setSelectedDayKey(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-slate-950/60" />
          <Dialog.Popup
            id="calendar-day-details"
            initialFocus={detailsHeading}
            finalFocus={dayTrigger}
            className="fixed left-1/2 top-1/2 z-50 flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl focus:outline-none"
          >
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 p-5 sm:p-6">
              <div className="min-w-0">
                <Dialog.Title
                  ref={detailsHeading}
                  tabIndex={-1}
                  className="text-lg font-semibold text-slate-900 focus-visible:outline-2 focus-visible:outline-violet-600"
                >
                  {selectedDay?.date.toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-slate-600">
                  {selectedPosts.length} posts. Select a post to view its
                  details.
                </Dialog.Description>
              </div>
              <Dialog.Close
                aria-label="Close day posts"
                className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-violet-600"
              >
                <X size={20} aria-hidden="true" />
              </Dialog.Close>
            </header>
            <ul className="min-h-0 space-y-2 overflow-y-auto p-5 sm:p-6">
              {selectedPosts.map((post) => (
                <li key={post._id} className="min-w-0">
                  <PostChip
                    post={post}
                    onView={(selectedPost) => {
                      setSelectedDayKey(null);
                      onViewPost(selectedPost);
                    }}
                  />
                </li>
              ))}
            </ul>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
