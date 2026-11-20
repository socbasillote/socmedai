import { expect, it } from "vitest";
import { postSchedulingError } from "./postScheduling";
const now = Date.parse("2026-11-20T00:00:00Z");
const rules = { defaultPostMode: "draft" as const, preferredTimes: [], allowedWeekdays: [5], minimumNoticeMinutes: 60, maximumAdvanceDays: 2 };
it("uses the workspace timezone for weekday validation", () => {
  // Thursday in UTC, Friday in Manila.
  expect(postSchedulingError("2026-11-26T23:00:00Z", "Asia/Manila", { ...rules, maximumAdvanceDays: 30 }, now)).toBeUndefined();
  expect(postSchedulingError("2026-11-26T23:00:00Z", "UTC", { ...rules, maximumAdvanceDays: 30 }, now)).toContain("weekday is disabled");
});
it("validates notice, advance limits, and future time while allowing undated drafts", () => {
  expect(postSchedulingError(undefined, "UTC", rules, now)).toBeUndefined();
  expect(postSchedulingError("invalid", "UTC", rules, now)).toContain("valid future");
  expect(postSchedulingError("2026-11-19T00:00:00Z", "UTC", rules, now)).toContain("valid future");
  expect(postSchedulingError("2026-11-20T00:30:00Z", "UTC", rules, now)).toContain("60 minutes");
  expect(postSchedulingError("2026-11-23T00:00:00Z", "UTC", rules, now)).toContain("within 2 days");
  expect(postSchedulingError("2026-11-20T01:00:00Z", "UTC", rules, now)).toBeUndefined();
});
