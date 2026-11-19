import { afterEach, expect, it, vi } from "vitest";
vi.mock("../services/imageGenerationWorkerService.js", () => ({ runImageGenerationWorkerOnce: vi.fn(async () => []) }));
vi.mock("../services/imageGenerationRecoverySweepService.js", () => ({ runImageGenerationRecoverySweep: vi.fn(async () => ({})) }));
import { startImageGenerationWorker } from "./imageGenerationWorkerRunner.js";
import { runImageGenerationWorkerOnce } from "../services/imageGenerationWorkerService.js";
import { runImageGenerationRecoverySweep } from "../services/imageGenerationRecoverySweepService.js";
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
it("runs recovery at startup and on each subsequent batch", async () => {
  vi.useFakeTimers();
  const stop = startImageGenerationWorker({ intervalMs: 1000 });
  await vi.advanceTimersByTimeAsync(0);
  expect(runImageGenerationRecoverySweep).toHaveBeenCalledOnce();
  expect(runImageGenerationWorkerOnce).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1000);
  expect(runImageGenerationRecoverySweep).toHaveBeenCalledTimes(2);
  await stop();
});
it("continues ordinary generation when recovery fails", async () => {
  vi.useFakeTimers();
  const onError = vi.fn();
  const stop = startImageGenerationWorker({ recover: async () => { throw new Error("Storage unavailable"); }, onError });
  await vi.advanceTimersByTimeAsync(0);
  expect(onError).toHaveBeenCalledOnce();
  expect(runImageGenerationWorkerOnce).toHaveBeenCalledOnce();
  await stop();
});
