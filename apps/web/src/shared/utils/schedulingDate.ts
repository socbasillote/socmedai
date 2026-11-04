/**
 * Scheduling date utilities.
 *
 * A datetime-local input has no timezone offset.
 * We interpret its value in the browser's local
 * timezone, matching Storm's existing behavior.
 *
 * No React hooks, API requests, or UI logic.
 */

/**
 * Convert a datetime-local input to a Date.
 *
 * Returns null when the input is invalid.
 * The returned Date represents an instant in time.
 */
export function parseLocalScheduleDate(value: string): Date | null {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

/**
 * Convert a valid Date to its UTC ISO timestamp.
 *
 * Example in Asia/Manila:
 * 2026-11-10T09:00 local
 * becomes:
 * 2026-11-10T01:00:00.000Z
 */
export function toScheduledAtISOString(date: Date): string {
  return date.toISOString();
}

/**
 * Format a Date for an HTML datetime-local input.
 *
 * Returns YYYY-MM-DDTHH:mm in the browser's
 * local timezone.
 */
export function toLocalDateTimeInputValue(date: Date): string {
  const localDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );

  return localDate.toISOString().slice(0, 16);
}
