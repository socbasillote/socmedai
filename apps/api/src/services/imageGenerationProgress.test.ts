import { expect, it } from "vitest";
import { imageGenerationProgress, imageGenerationPresentation } from "./imageGenerationProgress.js";
it("maps persisted phases to safe public progress stages", () => {
  expect(imageGenerationProgress("pending", "reserved").stage).toBe("queued");
  expect(imageGenerationProgress("pending", "claimed").stage).toBe("preparing");
  expect(imageGenerationProgress("pending", "provider_started").stage).toBe("generating");
  expect(imageGenerationProgress("pending", "storage_pending").stage).toBe("saving");
  expect(imageGenerationProgress("pending", "recovery_required").stage).toBe("needs_review");
  expect(imageGenerationProgress("ready", "storage_pending").stage).toBe("completed");
  expect(imageGenerationProgress("failed", "provider_started").stage).toBe("failed");
});

it("does not present inactive legacy requests as queued", () => {
  const result = imageGenerationPresentation("pending", { phase: "reserved" }, false);
  expect(result.state).toBe("action_required");
  expect(result.progress.label).toBe("Request is not queued");
});
it("distinguishes expired saving leases from active work", () => {
  const now = Date.now();
  expect(imageGenerationPresentation("pending", { phase: "storage_pending", leaseExpiresAt: new Date(now + 60000) }, true, now).state).toBe("processing");
  const expired = imageGenerationPresentation("pending", { phase: "storage_pending", leaseExpiresAt: new Date(now - 1) }, true, now);
  expect(expired.state).toBe("action_required");
  expect(expired.progress.stage).toBe("needs_review");
  expect(imageGenerationPresentation("ready", { phase: "storage_pending" }, false).state).toBe("ready");
});
