import { describe, expect, it } from "vitest";

import { calendarQuerySchema } from "./calendarQuerySchema.js";

const start = "2026-11-01T00:00:00.000Z";
const end = "2026-12-01T00:00:00.000Z";

describe("calendarQuerySchema", () => {
  it("accepts a valid UTC date range", () => {
    const result = calendarQuerySchema.safeParse({
      start,
      end,
    });

    expect(result.success).toBe(true);
  });

  it("rejects missing start", () => {
    expect(calendarQuerySchema.safeParse({ end }).success).toBe(false);
  });

  it("rejects missing end", () => {
    expect(calendarQuerySchema.safeParse({ start }).success).toBe(false);
  });

  it("rejects invalid timestamps", () => {
    expect(
      calendarQuerySchema.safeParse({
        start: "invalid-date",
        end,
      }).success,
    ).toBe(false);
  });

  it("requires UTC timestamps", () => {
    expect(
      calendarQuerySchema.safeParse({
        start: "2026-11-01T08:00:00+08:00",
        end,
      }).success,
    ).toBe(false);
  });

  it("rejects an end before start", () => {
    expect(
      calendarQuerySchema.safeParse({
        start: end,
        end: start,
      }).success,
    ).toBe(false);
  });

  it("rejects identical boundaries", () => {
    expect(
      calendarQuerySchema.safeParse({
        start,
        end: start,
      }).success,
    ).toBe(false);
  });

  it("accepts exactly 45 days", () => {
    const rangeStart = Date.parse(start);
    const rangeEnd = new Date(
      rangeStart + 45 * 24 * 60 * 60 * 1000,
    ).toISOString();

    expect(
      calendarQuerySchema.safeParse({
        start,
        end: rangeEnd,
      }).success,
    ).toBe(true);
  });

  it("rejects ranges exceeding 45 days", () => {
    const rangeStart = Date.parse(start);
    const rangeEnd = new Date(
      rangeStart + 46 * 24 * 60 * 60 * 1000,
    ).toISOString();

    expect(
      calendarQuerySchema.safeParse({
        start,
        end: rangeEnd,
      }).success,
    ).toBe(false);
  });

  it("rejects unknown query parameters", () => {
    expect(
      calendarQuerySchema.safeParse({
        start,
        end,
        workspaceId: "another-workspace",
      }).success,
    ).toBe(false);
  });
});
