import { describe, expect, it } from "vitest";

import {
  getCalendarRequestKey,
  getLocalMonthRange,
  shiftCalendarMonth,
} from "./calendarDates";

describe("calendarDates", () => {
  it("returns local month boundaries", () => {
    const range = getLocalMonthRange(2026, 10);

    const start = new Date(range.start);
    const end = new Date(range.end);

    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(10);
    expect(start.getDate()).toBe(1);
    expect(start.getHours()).toBe(0);

    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(11);
    expect(end.getDate()).toBe(1);
    expect(end.getHours()).toBe(0);
  });

  it("handles the December to January transition", () => {
    expect(shiftCalendarMonth(2026, 11, 1)).toEqual({
      year: 2027,
      monthIndex: 0,
    });
  });

  it("handles the January to December transition", () => {
    expect(shiftCalendarMonth(2026, 0, -1)).toEqual({
      year: 2025,
      monthIndex: 11,
    });
  });

  it("creates different keys for different workspaces", () => {
    const range = getLocalMonthRange(2026, 10);

    expect(getCalendarRequestKey("workspace-a", range)).not.toBe(
      getCalendarRequestKey("workspace-b", range),
    );
  });

  it("creates different keys for different months", () => {
    expect(
      getCalendarRequestKey("workspace-a", getLocalMonthRange(2026, 10)),
    ).not.toBe(
      getCalendarRequestKey("workspace-a", getLocalMonthRange(2026, 11)),
    );
  });
});
