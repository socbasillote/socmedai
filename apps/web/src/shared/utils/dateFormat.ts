/**
 * Shared date presentation utilities.
 *
 * Responsibilities:
 * - Format a valid Date in the browser's locale.
 * - Use the browser's local timezone.
 *
 * Does not:
 * - Parse scheduling inputs.
 * - Convert values to UTC.
 * - Validate scheduling rules.
 * - Decide which post timestamp to display.
 * - Own missing-date or invalid-date messages.
 */

/**
 * Format an existing Date for display.
 *
 * The caller is responsible for validating
 * the Date and handling missing values.
 *
 * This preserves existing Date.toLocaleString()
 * behavior without forcing a specific locale.
 */
export function formatLocalDateTime(date: Date): string {
  return date.toLocaleString();
}
