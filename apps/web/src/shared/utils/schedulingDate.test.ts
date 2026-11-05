import { describe, expect, it } from "vitest";

import {
  parseLocalScheduleDate,
  toScheduledAtISOString,
  toLocalDateTimeInputValue,
} from "./schedulingDate";

describe("schedulingDate", () => {
  it("parses a local date and time", () => {
    const result = parseLocalScheduleDate("2026-11-10T09:30");

    expect(result).not.toBeNull();

    expect(result?.getFullYear()).toBe(2026);
    expect(result?.getMonth()).toBe(10);
    expect(result?.getDate()).toBe(10);
    expect(result?.getHours()).toBe(9);
    expect(result?.getMinutes()).toBe(30);
  });

  it("returns null for invalid input", () => {
    expect(parseLocalScheduleDate("")).toBeNull();
    expect(parseLocalScheduleDate("not-a-date")).toBeNull();
  });

  it("converts a Date into UTC ISO format", () => {
    const date = new Date("2026-11-10T01:00:00.000Z");

    expect(toScheduledAtISOString(date)).toBe("2026-11-10T01:00:00.000Z");
  });

  it("formats local datetime input values", () => {
    const date = new Date(2026, 10, 10, 9, 30);

    expect(toLocalDateTimeInputValue(date)).toBe("2026-11-10T09:30");
  });

  it("preserves the instant through conversion", () => {
    const date = parseLocalScheduleDate("2026-11-10T09:30");

    expect(date).not.toBeNull();

    const iso = toScheduledAtISOString(date!);
    const restored = new Date(iso);

    expect(restored.getTime()).toBe(date!.getTime());
  });
});
