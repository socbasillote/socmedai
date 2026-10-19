import { describe, expect, it } from "vitest";

import { canTransitionPlatformResult } from "./platformResultTransitions.js";

describe("canTransitionPlatformResult", () => {
  it.each([
    ["pending", "publishing", true],
    ["pending", "failed", true],
    ["publishing", "published", true],
    ["publishing", "failed", true],
    ["publishing", "unknown", true],
    ["failed", "pending", true],
    ["failed", "publishing", true],
    ["unknown", "published", true],
    ["unknown", "failed", true],
    ["published", "pending", false],
    ["published", "publishing", false],
    ["published", "failed", false],
    ["pending", "published", false],
    ["unknown", "pending", false],
  ] as const)(
    "transition %s -> %s is allowed: %s",
    (current, next, expected) => {
      expect(canTransitionPlatformResult(current, next)).toBe(expected);
    },
  );

  it("rejects unchanged statuses", () => {
    expect(canTransitionPlatformResult("pending", "pending")).toBe(false);
    expect(canTransitionPlatformResult("publishing", "publishing")).toBe(false);
    expect(canTransitionPlatformResult("published", "published")).toBe(false);
    expect(canTransitionPlatformResult("failed", "failed")).toBe(false);
    expect(canTransitionPlatformResult("unknown", "unknown")).toBe(false);
  });
});
