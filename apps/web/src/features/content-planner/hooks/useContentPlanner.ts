import { useEffect, useState } from "react";

import type { Post } from "@/lib/posts";

import { getWorkspaceCalendarPosts } from "../api/calendarApi";

import {
  getCalendarRequestKey,
  getLocalMonthRange,
  shiftCalendarMonth,
} from "../utils/calendarDates";

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
) {
  const [month, setMonth] = useState<CalendarMonth>(
    () => initialMonth ?? getCurrentMonth(),
  );

  const [refreshVersion, setRefreshVersion] = useState(0);

  const [loadState, setLoadState] = useState<CalendarLoadState>({
    key: "",
    posts: [],
    loading: false,
    error: "",
  });

  const range = getLocalMonthRange(month.year, month.monthIndex);

  const requestKey = getCalendarRequestKey(workspaceId, range);

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
        const result = await getWorkspaceCalendarPosts(workspaceId, range);

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

  function goToPreviousMonth() {
    setMonth((current) =>
      shiftCalendarMonth(current.year, current.monthIndex, -1),
    );
  }

  function goToNextMonth() {
    setMonth((current) =>
      shiftCalendarMonth(current.year, current.monthIndex, 1),
    );
  }

  function goToCurrentMonth() {
    setMonth(getCurrentMonth());
  }

  function refreshCalendar() {
    setRefreshVersion((current) => current + 1);
  }

  return {
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
