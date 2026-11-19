import { expect, it } from "vitest";
import { imageGenerationProgress } from "./imageGenerationProgress.js";
it("maps persisted phases to safe public progress stages", () => {
  expect(imageGenerationProgress("pending", "reserved").stage).toBe("queued");
  expect(imageGenerationProgress("pending", "claimed").stage).toBe("preparing");
  expect(imageGenerationProgress("pending", "provider_started").stage).toBe("generating");
  expect(imageGenerationProgress("pending", "storage_pending").stage).toBe("saving");
  expect(imageGenerationProgress("pending", "recovery_required").stage).toBe("needs_review");
  expect(imageGenerationProgress("ready", "storage_pending").stage).toBe("completed");
  expect(imageGenerationProgress("failed", "provider_started").stage).toBe("failed");
});
