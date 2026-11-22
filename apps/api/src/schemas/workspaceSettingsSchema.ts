import { z } from "zod";
import { brandKitSchema } from "./brandKitSchema.js";

export const timezoneSchema = z.string().max(100).refine((value) => {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; }
  catch { return false; }
}, "Choose a valid IANA timezone.");

const destination = z.string().regex(/^[a-f\d]{24}$/i).nullable();
export const publishingPreferencesSchema = z.object({
  defaultPostMode: z.enum(["draft", "scheduled", "immediate"]),
  preferredTimes: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).max(12)
    .refine((times) => new Set(times).size === times.length, "Remove duplicate publishing times."),
  allowedWeekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7)
    .refine((days) => new Set(days).size === days.length, "Remove duplicate weekdays."),
  minimumNoticeMinutes: z.number().int().min(0).max(10080),
  maximumAdvanceDays: z.number().int().min(1).max(365),
}).strict();

export const workspaceSettingsPatchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(1000).optional(),
  timezone: timezoneSchema.optional(),
  defaultLanguage: z.enum(["en", "fil", "es", "fr", "de", "ja", "ko", "pt", "zh"]).optional(),
  avatar: z.string().max(180000).refine((value) => value === "" || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value), "Upload a PNG, JPG, or WebP avatar.").optional(),
  defaultDestinations: z.object({ facebook: destination, linkedin: destination }).strict().optional(),
  publishing: publishingPreferencesSchema.optional(),
  brandKit: brandKitSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "No settings were provided.");

export type WorkspaceSettingsPatch = z.infer<typeof workspaceSettingsPatchSchema>;

export function schedulingRuleError(settings: Record<string, unknown>, scheduledAt: Date, now = new Date()): string | null {
  if (!Number.isFinite(scheduledAt.getTime())) return "Choose a valid future publishing time.";
  const parsed = publishingPreferencesSchema.safeParse(settings.publishing);
  if (!parsed.success) return null; // Legacy workspaces retain existing behavior.
  const rules = parsed.data;
  const delta = scheduledAt.getTime() - now.getTime();
  if (delta < rules.minimumNoticeMinutes * 60000) return `Schedule at least ${rules.minimumNoticeMinutes} minutes in advance.`;
  if (delta > rules.maximumAdvanceDays * 86400000) return `Schedule within ${rules.maximumAdvanceDays} days.`;
  const timezone = timezoneSchema.safeParse(settings.timezone);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: timezone.success ? timezone.data : "UTC", weekday: "short" }).format(scheduledAt);
  if (!rules.allowedWeekdays.includes(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday))) return "This weekday is disabled in workspace publishing preferences.";
  return null;
}
