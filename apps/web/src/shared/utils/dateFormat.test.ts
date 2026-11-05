import { describe, expect, it } from "vitest";

import { formatLocalDateTime } from "./dateFormat";

describe("dateFormat", () => {
  it("matches native local date formatting", () => {
    const date = new Date("2026-11-10T01:00:00.000Z");

    expect(formatLocalDateTime(date)).toBe(date.toLocaleString());
  });

  it("does not mutate the Date instance", () => {
    const date = new Date("2026-11-10T01:00:00.000Z");

    const originalTime = date.getTime();

    formatLocalDateTime(date);

    expect(date.getTime()).toBe(originalTime);
  });
});
