import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("../services/imageGenerationWorkerService.js", () => ({ runImageGenerationWorkerOnce: vi.fn(async () => []) }));
vi.mock("../services/imageGenerationRecoverySweepService.js", () => ({ runImageGenerationRecoverySweep: vi.fn(async () => ({})) }));
import { parseImageWorkerRunnerConfig, startImageGenerationWorker } from "./imageGenerationWorkerRunner.js";
import { runImageGenerationWorkerOnce } from "../services/imageGenerationWorkerService.js";
import { runImageGenerationRecoverySweep } from "../services/imageGenerationRecoverySweepService.js";

const stops: Array<() => Promise<void>> = [];
function start(options: Parameters<typeof startImageGenerationWorker>[0] = {}) {
  const stop = startImageGenerationWorker({ changeStreamEnabled: false, ...options });
  stops.push(stop);
  return stop;
}
function subscription() {
  const stream = Object.assign(new EventEmitter(), { close: vi.fn(async () => {}) });
  const watch = vi.fn(() => stream);
  return { stream, watch };
}
const flush = () => vi.advanceTimersByTimeAsync(0);
afterEach(async () => {
  await Promise.all(stops.splice(0).map((stop) => stop()));
  vi.useRealTimers();
  vi.resetAllMocks();
  vi.mocked(runImageGenerationWorkerOnce).mockResolvedValue([]);
});

it("runs startup recovery immediately and defaults to 60-second fallback", async () => {
  vi.useFakeTimers();
  start();
  await flush();
  expect(runImageGenerationRecoverySweep).toHaveBeenCalledOnce();
  expect(runImageGenerationWorkerOnce).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(59_999);
  expect(runImageGenerationWorkerOnce).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1);
  expect(runImageGenerationRecoverySweep).toHaveBeenCalledTimes(2);
});

it("continues generation and polling after recovery or database failure", async () => {
  vi.useFakeTimers();
  const onError = vi.fn();
  vi.mocked(runImageGenerationWorkerOnce).mockRejectedValueOnce(new Error("Database unavailable"));
  start({ intervalMs: 1000, recover: async () => { throw new Error("Storage unavailable"); }, onError });
  await flush();
  expect(onError).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1000);
  expect(runImageGenerationWorkerOnce).toHaveBeenCalledTimes(2);
});

it("coalesces duplicate notifications during a batch without overlapping", async () => {
  vi.useFakeTimers();
  const { stream, watch } = subscription();
  let release!: () => void;
  vi.mocked(runImageGenerationWorkerOnce).mockImplementationOnce(() => new Promise((resolve) => {
    release = () => resolve([]);
  }));
  start({ changeStreamEnabled: true, watch });
  await flush();
  for (let i = 0; i < 20; i++) stream.emit("change", { operationType: "insert" });
  await vi.advanceTimersByTimeAsync(120_000);
  expect(runImageGenerationWorkerOnce).toHaveBeenCalledOnce();
  release();
  await flush();
  expect(runImageGenerationWorkerOnce).toHaveBeenCalledTimes(2);
  expect(watch).toHaveBeenCalledOnce();
});

it.each(["error", "close", "end", "invalidate"])("closes and reconnects after %s while polling continues", async (event) => {
  vi.useFakeTimers();
  const { stream, watch } = subscription();
  start({ changeStreamEnabled: true, watch, intervalMs: 1000, reconnectDelayMs: 5000 });
  await flush();
  if (event === "invalidate") stream.emit("change", { operationType: "invalidate" });
  else stream.emit(event, event === "error" ? new Error("Disconnected") : undefined);
  stream.emit("close");
  await vi.advanceTimersByTimeAsync(1000);
  expect(stream.close).toHaveBeenCalledOnce();
  expect(watch).toHaveBeenCalledOnce();
  expect(runImageGenerationWorkerOnce).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(4000);
  expect(watch).toHaveBeenCalledTimes(2);
});

it("polls when subscription creation throws and cancels retries on stop", async () => {
  vi.useFakeTimers();
  const watch = vi.fn(() => { throw new Error("Unsupported topology"); });
  const stop = start({ changeStreamEnabled: true, watch, intervalMs: 1000 });
  await vi.advanceTimersByTimeAsync(2000);
  expect(runImageGenerationWorkerOnce).toHaveBeenCalledTimes(3);
  await stop();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(watch).toHaveBeenCalledOnce();
  expect(runImageGenerationWorkerOnce).toHaveBeenCalledTimes(3);
});

it("failed asynchronous subscriptions do not turn reconnects into five-second polling", async () => {
  vi.useFakeTimers();
  const streams: ReturnType<typeof subscription>["stream"][] = [];
  const watch = vi.fn(() => {
    const { stream } = subscription();
    streams.push(stream);
    return stream;
  });
  start({ changeStreamEnabled: true, watch });
  await flush();
  streams[0]!.emit("error", new Error("Standalone MongoDB"));
  await vi.advanceTimersByTimeAsync(5000);
  expect(watch).toHaveBeenCalledTimes(2);
  streams[1]!.emit("error", new Error("Still unavailable"));
  await vi.advanceTimersByTimeAsync(5000);
  expect(watch).toHaveBeenCalledTimes(3);
  expect(runImageGenerationWorkerOnce).toHaveBeenCalledOnce();
});

it("waits for batch and cursor cleanup, stops further claims, and is idempotent", async () => {
  vi.useFakeTimers();
  const { stream, watch } = subscription();
  let releaseBatch!: () => void;
  let releaseCursor!: () => void;
  stream.close.mockImplementation(() => new Promise((resolve) => { releaseCursor = resolve; }));
  vi.mocked(runImageGenerationWorkerOnce).mockImplementationOnce(async (_deps, _limit, shouldStop) => {
    await new Promise<void>((resolve) => { releaseBatch = resolve; });
    expect(shouldStop?.()).toBe(true);
    return [];
  });
  const stop = start({ changeStreamEnabled: true, watch });
  await flush();
  const stopped = vi.fn();
  const stopping = stop();
  expect(stop()).toBe(stopping);
  void stopping.then(stopped);
  stream.emit("change", { operationType: "insert" });
  releaseBatch();
  await flush();
  expect(stopped).not.toHaveBeenCalled();
  releaseCursor();
  await stopping;
  await vi.advanceTimersByTimeAsync(120_000);
  expect(watch).toHaveBeenCalledOnce();
  expect(runImageGenerationWorkerOnce).toHaveBeenCalledOnce();
});

it("drains successful full batches immediately but does not spin on review outcomes", async () => {
  vi.useFakeTimers();
  vi.mocked(runImageGenerationWorkerOnce)
    .mockResolvedValueOnce([{ outcome: "completed" }])
    .mockResolvedValueOnce([{ outcome: "recovery_required" }]);
  start({ batchSize: 1 });
  await flush();
  await vi.advanceTimersByTimeAsync(1);
  expect(runImageGenerationWorkerOnce).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(59_000);
  expect(runImageGenerationWorkerOnce).toHaveBeenCalledTimes(2);
});

it("validates runner environment defaults and timer limits", () => {
  expect(parseImageWorkerRunnerConfig({})).toEqual({ changeStreamEnabled: true, intervalMs: 60_000, reconnectDelayMs: 5000 });
  expect(parseImageWorkerRunnerConfig({ IMAGE_WORKER_CHANGE_STREAM_ENABLED: "false" }).changeStreamEnabled).toBe(false);
  for (const key of ["IMAGE_WORKER_FALLBACK_POLL_INTERVAL_MS", "IMAGE_WORKER_RECONNECT_DELAY_MS"]) {
    for (const value of ["", "NaN", "999", "1.5", "2147483648", "Infinity"]) {
      expect(() => parseImageWorkerRunnerConfig({ [key]: value })).toThrow();
    }
  }
  expect(() => parseImageWorkerRunnerConfig({ IMAGE_WORKER_CHANGE_STREAM_ENABLED: "yes" })).toThrow();
  expect(() => start({ intervalMs: 999 })).toThrow();
});
