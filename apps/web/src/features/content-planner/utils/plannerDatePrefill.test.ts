import { describe, expect, it } from "vitest";

import { getPlannerSchedulePrefill } from "./plannerDatePrefill";

describe("getPlannerSchedulePrefill", () => {
  const now = new Date(2026, 10, 5, 8, 0, 0);

  it("prefills future dates at 9 AM local", () => {
    expect(getPlannerSchedulePrefill("2026-11-12", now)).toBe(
      "2026-11-12T09:00",
    );
  });

  it("rejects past dates", () => {
    expect(getPlannerSchedulePrefill("2026-11-04", now)).toBeNull();
  });

  it("accepts today when 9 AM is future", () => {
    expect(getPlannerSchedulePrefill("2026-11-05", now)).toBe(
      "2026-11-05T09:00",
    );
  });

  it("chooses a later time for today", () => {
    const afternoon = new Date(2026, 10, 5, 14, 10, 0);

    const value = getPlannerSchedulePrefill("2026-11-05", afternoon);

    expect(value).not.toBeNull();

    const scheduled = new Date(value!);

    expect(scheduled.getTime() - afternoon.getTime()).toBeGreaterThanOrEqual(
      30 * 60_000,
    );
  });

  it("rejects impossible dates", () => {
    expect(getPlannerSchedulePrefill("2026-02-30", now)).toBeNull();
  });

  it("accepts valid leap days", () => {
    expect(getPlannerSchedulePrefill("2028-02-29", now)).toBe(
      "2028-02-29T09:00",
    );
  });

  it("rejects invalid date formats", () => {
    expect(getPlannerSchedulePrefill("11/12/2026", now)).toBeNull();

    expect(getPlannerSchedulePrefill("2026-11-12T00:00", now)).toBeNull();
  });

  it("rejects a late-night today prefill", () => {
    const lateNight = new Date(2026, 10, 5, 23, 45, 0);

    expect(getPlannerSchedulePrefill("2026-11-05", lateNight)).toBeNull();
  });

  it("ignores a missing parameter", () => {
    expect(getPlannerSchedulePrefill(null, now)).toBeNull();
  });
});
