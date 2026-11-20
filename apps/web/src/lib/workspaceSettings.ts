import { apiFetch } from "./api";
import type { Workspace } from "./workspaces";

export type PublishingPreferences = {
  defaultPostMode: "draft" | "scheduled" | "immediate";
  preferredTimes: string[];
  allowedWeekdays: number[];
  minimumNoticeMinutes: number;
  maximumAdvanceDays: number;
};
export type WorkspacePreferences = {
  description: string;
  timezone: string;
  defaultLanguage: string;
  avatar: string;
  defaultDestinations: { facebook: string | null; linkedin: string | null };
  publishing: PublishingPreferences;
};

export function readWorkspacePreferences(workspace?: Pick<Workspace, "settings"> | null): WorkspacePreferences {
  const settings = workspace?.settings ?? {};
  const publishing = settings.publishing as Partial<PublishingPreferences> | undefined;
  const destinations = settings.defaultDestinations as WorkspacePreferences["defaultDestinations"] | undefined;
  return {
    description: typeof settings.description === "string" ? settings.description : "",
    timezone: typeof settings.timezone === "string" ? settings.timezone : Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    defaultLanguage: typeof settings.defaultLanguage === "string" ? settings.defaultLanguage : "en",
    avatar: typeof settings.avatar === "string" ? settings.avatar : "",
    defaultDestinations: { facebook: destinations?.facebook ?? null, linkedin: destinations?.linkedin ?? null },
    publishing: {
      defaultPostMode: publishing?.defaultPostMode ?? "draft",
      preferredTimes: publishing?.preferredTimes ?? [],
      allowedWeekdays: publishing?.allowedWeekdays ?? [0, 1, 2, 3, 4, 5, 6],
      minimumNoticeMinutes: publishing?.minimumNoticeMinutes ?? 0,
      maximumAdvanceDays: publishing?.maximumAdvanceDays ?? 365,
    },
  };
}

export async function saveWorkspacePreferences(id: string, patch: Partial<WorkspacePreferences> & { name?: string }) {
  const response = await apiFetch<{ workspace: Workspace }>(`/api/workspaces/${id}/settings`, { method: "PATCH", body: JSON.stringify(patch) });
  return response.workspace;
}

export async function setWorkspaceLifecycle(id: string, action: "archive" | "restore" | "delete", confirmation: string) {
  const response = await apiFetch<{ workspace: Workspace | null }>(`/api/workspaces/${id}/lifecycle`, { method: "POST", body: JSON.stringify({ action, confirmation }) });
  return response.workspace;
}

export function zonedInputValue(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

// Match wall-clock times against actual timezone offsets. Nonexistent DST times
// are rejected; duplicated autumn times consistently use the first occurrence.
export function parseZonedInput(value: string, timezone: string): Date | null {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)) return null;
  const wall = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(wall)) return null;
  const candidates: number[] = [];
  for (const shift of [-86400000, 0, 86400000]) {
    const sample = wall + shift;
    const offset = Date.parse(`${zonedInputValue(new Date(sample), timezone)}:00Z`) - sample;
    const candidate = wall - offset;
    if (zonedInputValue(new Date(candidate), timezone) === value) candidates.push(candidate);
  }
  return candidates.length ? new Date(Math.min(...candidates)) : null;
}

export function nextPreferredSchedule(preferences: WorkspacePreferences, now = new Date()): string {
  const firstDate = zonedInputValue(now, preferences.timezone).slice(0, 10);
  for (let day = 0; day <= preferences.publishing.maximumAdvanceDays; day++) {
    const calendarDate = new Date(`${firstDate}T12:00:00Z`);
    calendarDate.setUTCDate(calendarDate.getUTCDate() + day);
    if (!preferences.publishing.allowedWeekdays.includes(calendarDate.getUTCDay())) continue;
    for (const time of [...preferences.publishing.preferredTimes].sort()) {
      const value = `${calendarDate.toISOString().slice(0, 10)}T${time}`;
      const date = parseZonedInput(value, preferences.timezone);
      if (date && date.getTime() > now.getTime() && date.getTime() - now.getTime() >= preferences.publishing.minimumNoticeMinutes * 60000 && date.getTime() - now.getTime() <= preferences.publishing.maximumAdvanceDays * 86400000) return value;
    }
  }
  return "";
}

export function canApplyWorkspaceDefaults(mode: "create" | "edit", explicitlyChanged: boolean, initialized: boolean) {
  return mode === "create" && !explicitlyChanged && !initialized;
}
