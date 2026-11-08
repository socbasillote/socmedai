import {
  runImageGenerationWorkerOnce,
  type ImageWorkerDependencies,
} from "../services/imageGenerationWorkerService.js";

export type ImageWorkerRunnerOptions = {
  intervalMs?: number;
  batchSize?: number;
  dependencies?: ImageWorkerDependencies;
  onError?: (error: unknown) => void;
};

/**
 * Starts an in-process polling loop.
 *
 * Invoke only after MongoDB is connected.
 * Returns a cleanup function for shutdown.
 *
 * It never starts overlapping batches.
 */
export function startImageGenerationWorker(
  options: ImageWorkerRunnerOptions = {},
): () => Promise<void> {
  const intervalMs = options.intervalMs ?? 5000;
  const batchSize = options.batchSize ?? 5;

  if (
    !Number.isInteger(intervalMs) ||
    intervalMs < 1000 ||
    !Number.isInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > 50
  ) {
    throw new Error("Invalid image worker polling settings.");
  }

  let stopped = false;
  let running: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function schedule() {
    if (stopped) return;

    timer = setTimeout(() => {
      void run();
    }, intervalMs);
  }

  function run() {
    if (stopped || running) return;

    running = (async () => {
      try {
        await runImageGenerationWorkerOnce(options.dependencies, batchSize);
      } catch (error) {
        options.onError?.(error);
      } finally {
        running = null;
        schedule();
      }
    })();
  }

  // Begin polling immediately.
  run();

  return async () => {
    stopped = true;

    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    // Allow the current batch to finish.
    if (running) {
      await running;
    }
  };
}
