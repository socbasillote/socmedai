import type { EventEmitter } from "node:events";
import MediaAsset from "../models/MediaAsset.js";
import { runImageGenerationRecoverySweep } from "../services/imageGenerationRecoverySweepService.js";
import {
  runImageGenerationWorkerOnce,
  type ImageWorkerDependencies,
} from "../services/imageGenerationWorkerService.js";

export function parseImageWorkerRunnerConfig(source: NodeJS.ProcessEnv) {
  const enabled = source.IMAGE_WORKER_CHANGE_STREAM_ENABLED ?? "true";
  if (enabled !== "true" && enabled !== "false") {
    throw new Error("Invalid image worker change stream setting.");
  }
  function milliseconds(key: string, fallback: number) {
    const value = source[key];
    const parsed = value === undefined ? fallback : Number(value);
    if ((value !== undefined && !/^[1-9]\d*$/.test(value)) ||
        !Number.isSafeInteger(parsed) || parsed < 1000 || parsed > 2_147_483_647) {
      throw new Error("Invalid image worker timer setting.");
    }
    return parsed;
  }
  return {
    changeStreamEnabled: enabled === "true",
    intervalMs: milliseconds("IMAGE_WORKER_FALLBACK_POLL_INTERVAL_MS", 60_000),
    reconnectDelayMs: milliseconds("IMAGE_WORKER_RECONNECT_DELAY_MS", 5000),
  };
}

// Notifications are hints only. Discovery, admission and atomic claiming remain
// authoritative. Do not wake on lease heartbeats or provider/storage progress.
export function watchImageGenerationJobs() {
  return MediaAsset.collection.watch([
    { $match: { $or: [
      { operationType: "invalidate" },
      {
        "fullDocument.status": "pending",
        "fullDocument.generationExecution.phase": { $in: ["reserved", "claimed"] },
        $or: [
          { operationType: { $in: ["insert", "replace"] } },
          { operationType: "update", $expr: { $gt: [
            { $size: { $setIntersection: [
              ["status", "generationExecution", "generationExecution.phase"],
              { $map: {
                input: { $objectToArray: { $ifNull: ["$updateDescription.updatedFields", {}] } },
                as: "field", in: "$$field.k",
              } },
            ] } }, 0,
          ] } },
        ],
      },
    ] } },
    // Never deliver prompts, bytes or provider responses to the runner.
    { $project: { _id: 1, operationType: 1 } },
  ], { fullDocument: "updateLookup", maxAwaitTimeMS: 1000 });
}

type JobChangeStream = Pick<EventEmitter, "on"> & { close: () => Promise<void> };

export type ImageWorkerRunnerOptions = {
  intervalMs?: number;
  batchSize?: number;
  changeStreamEnabled?: boolean;
  reconnectDelayMs?: number;
  watch?: () => JobChangeStream;
  dependencies?: ImageWorkerDependencies;
  recover?: () => Promise<unknown>;
  onError?: (error: unknown) => void;
};

/** Invoke after connecting MongoDB. One subscription and one batch per runner. */
export function startImageGenerationWorker(
  options: ImageWorkerRunnerOptions = {},
): () => Promise<void> {
  const intervalMs = options.intervalMs ?? 60_000;
  const reconnectDelayMs = options.reconnectDelayMs ?? 5000;
  const batchSize = options.batchSize ?? 5;
  if (![intervalMs, reconnectDelayMs].every((value) =>
    Number.isSafeInteger(value) && value >= 1000 && value <= 2_147_483_647) ||
    !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 50) {
    throw new Error("Invalid image worker polling settings.");
  }

  let stopped = false;
  let pending = false;
  let running: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let stream: JobChangeStream | null = null;
  let closing: Promise<void> | null = null;
  let stopPromise: Promise<void> | null = null;
  const report = (error: unknown) => {
    // A logging callback must not break polling or resource cleanup.
    try { options.onError?.(error); } catch { /* Continue recovery. */ }
  };

  function schedule(delay = intervalMs) {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; wake(); }, delay);
  }

  function wake() {
    if (stopped) return;
    if (running) { pending = true; return; }
    if (timer) { clearTimeout(timer); timer = null; }
    // Defer execution until running is assigned, including synchronous failures.
    running = Promise.resolve().then(async () => {
      pending = false;
      try {
        await (options.recover ?? (() => runImageGenerationRecoverySweep(options.dependencies?.bucket)))();
      } catch (error) { report(error); }
      if (stopped) return;
      try {
        const results = await runImageGenerationWorkerOnce(
          options.dependencies, batchSize, () => stopped,
        );
        // Drain a backlog without waiting a minute between successful batches.
        // Failed/review-only batches wait for recovery rather than busy-looping.
        if (results.length >= batchSize && results.some((result) =>
          ["completed", "rejected", "claim_lost"].includes(result.outcome))) pending = true;
      } catch (error) { report(error); }
    }).finally(() => {
      running = null;
      schedule(pending ? 0 : intervalMs);
    });
  }

  async function closeStream(current: JobChangeStream) {
    try { await current.close(); } catch (error) { report(error); }
  }

  function reconnect() {
    if (stopped || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      subscribe();
    }, reconnectDelayMs);
  }

  function subscribe() {
    if (stopped || stream || closing || options.changeStreamEnabled === false) return;
    try {
      const current = (options.watch ?? watchImageGenerationJobs)();
      stream = current;
      const failed = (error?: unknown) => {
        if (stream !== current) return;
        stream = null;
        if (error) report(error);
        closing = closeStream(current).finally(() => {
          closing = null;
          reconnect();
        });
      };
      current.on("error", failed);
      current.on("close", () => failed());
      current.on("end", () => failed());
      let initialized = false;
      current.on("resumeTokenChanged", () => {
        if (initialized || stream !== current) return;
        initialized = true;
        // Recover the startup/reconnection gap once the cursor is established.
        wake();
      });
      current.on("change", (event) => {
        if (stopped || stream !== current) return;
        if (event.operationType === "invalidate") failed();
        else wake();
      });
      // Failed subscription attempts never trigger extra database scans or
      // interrupt the independent fallback polling timer.
    } catch (error) { report(error); reconnect(); }
  }

  subscribe();
  wake();

  return () => {
    if (stopPromise) return stopPromise;
    stopped = true;
    if (timer) clearTimeout(timer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    const current = stream;
    stream = null;
    stopPromise = (async () => {
      await Promise.all([
        current ? closeStream(current) : Promise.resolve(),
        closing,
        running,
      ]);
    })();
    return stopPromise;
  };
}
