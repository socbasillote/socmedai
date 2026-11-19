import { useEffect, useState } from "react";

import type { Post } from "@/lib/posts";

import { getWorkspaceCalendarPosts } from "../api/calendarApi";

import {
  getCalendarRequestKey,
  getLocalMonthRange,
  shiftCalendarMonth,
} from "../utils/calendarDates";

import { getCalendarWeekDays } from "../utils/calendarGrid";
import type { PlannerMonth } from "../utils/plannerNavigation";

type CalendarMonth = {
  year: number;
  monthIndex: number;
};

type CalendarLoadState = {
  key: string;
  posts: Post[];
  loading: boolean;
  error: string;
};

function getCurrentMonth(): CalendarMonth {
  const now = new Date();

  return {
    year: now.getFullYear(),
    monthIndex: now.getMonth(),
  };
}

export function useContentPlanner(
  workspaceId: string,
  initialMonth?: PlannerMonth | null,
  view: "month" | "week" | "list" = "month",
) {
  const [month, setMonth] = useState<CalendarMonth>(
    () => initialMonth ?? getCurrentMonth(),
  );

  const [weekAnchor, setWeekAnchor] = useState(() => {
    const now = new Date();
    return initialMonth && (initialMonth.year !== now.getFullYear() || initialMonth.monthIndex !== now.getMonth())
      ? new Date(initialMonth.year, initialMonth.monthIndex, 1) : now;
  });
  const [refreshVersion, setRefreshVersion] = useState(0);

  const [loadState, setLoadState] = useState<CalendarLoadState>({
    key: "",
    posts: [],
    loading: false,
    error: "",
  });

  const weekDays = getCalendarWeekDays(weekAnchor);
  const weekStart = weekDays[0].date;
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7);
  const range = view === "week"
    ? { start: weekStart.toISOString(), end: weekEnd.toISOString() }
    : getLocalMonthRange(month.year, month.monthIndex);

  const requestKey = getCalendarRequestKey(workspaceId, range);

  useEffect(() => {
    const refresh = () => setRefreshVersion((version) => version + 1);
    window.addEventListener("storm:posts-changed", refresh);
    return () => window.removeEventListener("storm:posts-changed", refresh);
  }, []);
  useEffect(() => {
    let cancelled = false;

    if (!workspaceId) {
      return () => {
        cancelled = true;
      };
    }

    async function loadCalendar() {
      setLoadState({
        key: requestKey,
        posts: [],
        loading: true,
        error: "",
      });

      try {
        const result = await getWorkspaceCalendarPosts(workspaceId, { start: range.start, end: range.end });

        if (cancelled) return;

        setLoadState({
          key: requestKey,
          posts: result.posts,
          loading: false,
          error: "",
        });
      } catch (error) {
        if (cancelled) return;

        setLoadState({
          key: requestKey,
          posts: [],
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "Unable to load calendar posts.",
        });
      }
    }

    void loadCalendar();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, range.start, range.end, requestKey, refreshVersion]);

  // Only expose records belonging to the
  // currently requested workspace and month.
  const stateIsCurrent = Boolean(workspaceId) && loadState.key === requestKey;

  const posts = stateIsCurrent ? loadState.posts : [];

  const loading =
    Boolean(workspaceId) && (!stateIsCurrent || loadState.loading);

  const error = stateIsCurrent ? loadState.error : "";

  function shiftWeek(offset: number) {
    const next = new Date(weekAnchor.getFullYear(), weekAnchor.getMonth(), weekAnchor.getDate() + offset * 7);
    setWeekAnchor(next);
    setMonth({ year: next.getFullYear(), monthIndex: next.getMonth() });
  }

  function goToPreviousMonth() {
    if (view === "week") { shiftWeek(-1); return; }
    const previous = shiftCalendarMonth(month.year, month.monthIndex, -1);
    setWeekAnchor(new Date(previous.year, previous.monthIndex, 1));
    setMonth((current) =>
      shiftCalendarMonth(current.year, current.monthIndex, -1),
    );
  }

  function goToNextMonth() {
    if (view === "week") { shiftWeek(1); return; }
    const next = shiftCalendarMonth(month.year, month.monthIndex, 1);
    setWeekAnchor(new Date(next.year, next.monthIndex, 1));
    setMonth((current) =>
      shiftCalendarMonth(current.year, current.monthIndex, 1),
    );
  }

  function goToCurrentMonth() {
    setMonth(getCurrentMonth());
    setWeekAnchor(new Date());
  }

  function refreshCalendar() {
    setRefreshVersion((current) => current + 1);
  }

  return {
    weekAnchor,
    year: month.year,
    monthIndex: month.monthIndex,
    range,

    posts,
    loading,
    error,

    goToPreviousMonth,
    goToNextMonth,
    goToCurrentMonth,
    refreshCalendar,
  };
}
