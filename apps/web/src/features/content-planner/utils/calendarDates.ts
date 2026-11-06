import type { CalendarDateRange } from "../api/calendarApi";

/**
 * Generate a UTC range covering one month in
 * the browser's local timezone.
 *
 * Start is inclusive; end is exclusive.
 */
export function getLocalMonthRange(
  year: number,
  monthIndex: number,
): CalendarDateRange {
  const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);

  const end = new Date(year, monthIndex + 1, 1, 0, 0, 0, 0);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

/**
 * Change the viewed month while correctly
 * handling year boundaries.
 */
export function shiftCalendarMonth(
  year: number,
  monthIndex: number,
  offset: number,
) {
  const date = new Date(year, monthIndex + offset, 1);

  return {
    year: date.getFullYear(),
    monthIndex: date.getMonth(),
  };
}

/**
 * A stable key representing workspace and range.
 * Used to prevent stale calendar data from
 * appearing after workspace or month changes.
 */
export function getCalendarRequestKey(
  workspaceId: string,
  range: CalendarDateRange,
): string {
  return [workspaceId, range.start, range.end].join("|");
}
