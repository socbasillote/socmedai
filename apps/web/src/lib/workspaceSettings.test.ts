import { describe, it, expect } from "vitest";
import { canApplyWorkspaceDefaults, nextPreferredSchedule, parseZonedInput, readWorkspacePreferences, zonedInputValue } from "./workspaceSettings";

describe("Workspace scheduling defaults", () => {
  it("provides safe defaults for legacy workspaces", () => {
    expect(readWorkspacePreferences({ settings: {} })).toMatchObject({ defaultLanguage: "en", defaultDestinations: { facebook: null, linkedin: null }, publishing: { defaultPostMode: "draft", preferredTimes: [], allowedWeekdays: [0, 1, 2, 3, 4, 5, 6] } });
  });
  it("converts workspace wall times to UTC independently of the browser timezone", () => {
    const date = parseZonedInput("2026-11-20T09:00", "Asia/Manila")!;
    expect(date.toISOString()).toBe("2026-11-20T01:00:00.000Z");
    expect(zonedInputValue(date, "Asia/Manila")).toBe("2026-11-20T09:00");
  });
  it("rejects impossible dates and spring DST gaps, and resolves autumn repeats deterministically", () => {
    expect(parseZonedInput("2026-02-30T10:00", "UTC")).toBeNull();
    expect(parseZonedInput("2026-03-08T02:30", "America/New_York")).toBeNull();
    expect(parseZonedInput("2026-11-01T01:30", "America/New_York")?.toISOString()).toBe("2026-11-01T05:30:00.000Z");
    expect(parseZonedInput("invalid", "UTC")).toBeNull();
  });
  it("picks the next preferred slot satisfying weekdays, notice and horizon", () => {
    const preferences = readWorkspacePreferences({ settings: { timezone: "Asia/Manila", publishing: { preferredTimes: ["17:30", "09:00"], allowedWeekdays: [1, 2, 3, 4, 5], minimumNoticeMinutes: 60, maximumAdvanceDays: 7 } } });
    expect(nextPreferredSchedule(preferences, new Date("2026-11-20T01:30:00Z"))).toBe("2026-11-20T17:30");
    expect(nextPreferredSchedule(preferences, new Date("2026-11-20T10:00:00Z"))).toBe("2026-11-23T09:00");
    preferences.publishing.maximumAdvanceDays = 1;
    expect(nextPreferredSchedule(preferences, new Date("2026-11-20T10:00:00Z"))).toBe("");
  });
  it("never applies defaults to existing posts, explicit choices or already initialized editors", () => {
    expect(canApplyWorkspaceDefaults("edit", false, false)).toBe(false);
    expect(canApplyWorkspaceDefaults("create", true, false)).toBe(false);
    expect(canApplyWorkspaceDefaults("create", false, true)).toBe(false);
    expect(canApplyWorkspaceDefaults("create", false, false)).toBe(true);
  });
});
