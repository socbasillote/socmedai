import { afterEach, expect, it, vi } from "vitest";
import { getPublishingCapabilities, publishingUnavailableReason } from "./publishingCapabilities.js";

afterEach(() => vi.unstubAllEnvs());

it("disables Facebook and scheduling unless explicitly enabled", () => {
  vi.stubEnv("FACEBOOK_PUBLISHING_ENABLED", "false");
  vi.stubEnv("SCHEDULED_PUBLISHING_ENABLED", "false");
  expect(getPublishingCapabilities()).toEqual({
    facebook: { publishNow: false, schedule: false },
    linkedin: { publishNow: true, schedule: false },
    instagram: { publishNow: true, schedule: false },
  });
  expect(publishingUnavailableReason("facebook", "now")).toContain("disabled");
  expect(publishingUnavailableReason("linkedin", "schedule")).toContain("disabled");
});

it("requires both flags to schedule Facebook, while preserving other platforms", () => {
  vi.stubEnv("FACEBOOK_PUBLISHING_ENABLED", "false");
  vi.stubEnv("SCHEDULED_PUBLISHING_ENABLED", "true");
  expect(getPublishingCapabilities().facebook.schedule).toBe(false);
  expect(getPublishingCapabilities().instagram.schedule).toBe(true);
  vi.stubEnv("FACEBOOK_PUBLISHING_ENABLED", "true");
  expect(getPublishingCapabilities().facebook).toEqual({ publishNow: true, schedule: true });
  expect(publishingUnavailableReason("facebook", "schedule")).toBeUndefined();
  expect(publishingUnavailableReason("unknown", "now")).toContain("not supported");
});
