import { toLocalDateTimeInputValue } from "@/shared/utils/schedulingDate";

import { toLocalDateKey } from "./calendarGrid";

/**
 * Convert a local YYYY-MM-DD calendar date
 * into a valid datetime-local input value.
 *
 * This does not convert the date to UTC.
 * The existing Post Editor does that when saving.
 */
export function getPlannerSchedulePrefill(
  value: string | null,
  now: Date = new Date(),
): string | null {
  if (!value) return null;

  // Strict YYYY-MM-DD validation.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);

  if (
    !year ||
    !month ||
    !day ||
    year < 1000 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  // Construct local time, not UTC.
  const date = new Date(year, month - 1, day, 9, 0, 0, 0);

  // Reject impossible dates, such as
  // February 30 or April 31.
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== 9
  ) {
    return null;
  }

  const todayKey = toLocalDateKey(now);

  // Prevent scheduling from past dates.
  if (value < todayKey) {
    return null;
  }

  if (value === todayKey) {
    // Give the user at least 30 minutes.
    // An extra minute handles seconds
    // before trimming to HH:mm precision.
    const earliest = new Date(now.getTime() + 31 * 60_000);

    earliest.setSeconds(0, 0);

    if (earliest > date) {
      // Do not silently move a selected
      // calendar day into tomorrow.
      if (toLocalDateKey(earliest) !== value) {
        return null;
      }

      return toLocalDateTimeInputValue(earliest);
    }
  }

  return toLocalDateTimeInputValue(date);
}
