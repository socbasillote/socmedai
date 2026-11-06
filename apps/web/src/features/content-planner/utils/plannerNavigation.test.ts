import { describe, expect, it } from "vitest";

import {
  buildPlannerCreatePostUrl,
  formatPlannerMonth,
  getPlannerReturnUrl,
  parsePlannerMonth,
} from "./plannerNavigation";

describe("plannerNavigation", () => {
  it("formats a calendar month", () => {
    expect(
      formatPlannerMonth({
        year: 2026,
        monthIndex: 11,
      }),
    ).toBe("2026-12");
  });

  it("parses a valid month", () => {
    expect(parsePlannerMonth("2026-12")).toEqual({
      year: 2026,
      monthIndex: 11,
    });
  });

  it("rejects invalid months", () => {
    expect(parsePlannerMonth("2026-13")).toBeNull();
    expect(parsePlannerMonth("2026-00")).toBeNull();
    expect(parsePlannerMonth("December 2026")).toBeNull();
    expect(parsePlannerMonth(null)).toBeNull();
  });

  it("creates a date-specific editor URL", () => {
    expect(
      buildPlannerCreatePostUrl(
        {
          year: 2026,
          monthIndex: 11,
        },
        "2026-12-18",
      ),
    ).toBe("/posts/new?from=planner&month=2026-12&date=2026-12-18");
  });

  it("creates an editor URL without a date", () => {
    expect(
      buildPlannerCreatePostUrl({
        year: 2026,
        monthIndex: 11,
      }),
    ).toBe("/posts/new?from=planner&month=2026-12");
  });

  it("returns to the original Planner month", () => {
    expect(
      getPlannerReturnUrl("?from=planner&month=2026-12&date=2026-12-18"),
    ).toBe("/calendar?month=2026-12");
  });

  it("does not redirect normal editor visits", () => {
    expect(getPlannerReturnUrl("")).toBeNull();

    expect(getPlannerReturnUrl("?date=2026-12-18")).toBeNull();
  });

  it("rejects invalid Planner return context", () => {
    expect(getPlannerReturnUrl("?from=planner&month=2026-99")).toBeNull();
  });

  it("ignores arbitrary redirect parameters", () => {
    expect(
      getPlannerReturnUrl(
        "?from=planner&month=2026-12&returnTo=https://example.com",
      ),
    ).toBe("/calendar?month=2026-12");
  });

  it("handles a January return after year transition", () => {
    expect(getPlannerReturnUrl("?from=planner&month=2027-01")).toBe(
      "/calendar?month=2027-01",
    );
  });

  it("ignores a missing Planner month", () => {
    expect(getPlannerReturnUrl("?from=planner")).toBeNull();
  });

  it("does not allow an external return destination", () => {
    expect(
      getPlannerReturnUrl(
        "?from=planner&month=2026-12&returnTo=https://example.com",
      ),
    ).toBe("/calendar?month=2026-12");
  });
});
