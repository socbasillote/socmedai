import type { WorkspacePreferences } from "./workspaceSettings";

export function postSchedulingError(scheduledAt: string | undefined, timezone: string,
  rules?: WorkspacePreferences["publishing"], now = Date.now()): string | undefined {
  if (!scheduledAt) return undefined;
  const date = new Date(scheduledAt);
  if (!Number.isFinite(date.getTime()) || date.getTime() <= now) return "Choose a valid future publishing time.";
  if (!rules) return undefined;
  const delta = date.getTime() - now;
  if (delta < rules.minimumNoticeMinutes * 60000) return `Schedule at least ${rules.minimumNoticeMinutes} minutes in advance.`;
  if (delta > rules.maximumAdvanceDays * 86400000) return `Schedule within ${rules.maximumAdvanceDays} days.`;
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(date);
  if (!rules.allowedWeekdays.includes(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday))) return "This weekday is disabled in workspace publishing preferences.";
}
