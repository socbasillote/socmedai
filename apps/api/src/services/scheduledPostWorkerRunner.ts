import { recoverStalePublishingPosts } from "./scheduledPostWorker.js";

const POLL_INTERVAL_MS = 5_000;

let interval: ReturnType<typeof setInterval> | undefined;
let running = false;
let stopped = false;

async function pollDuePosts(): Promise<void> {
  if (running || stopped) {
    return;
  }

  running = true;

  try {
    const result = await recoverStalePublishingPosts();

    if (result.modifiedCount > 0) {
      console.warn(
        `[scheduled-post-worker] Marked ${result.modifiedCount} stale publishing post(s) as failed.`,
      );
    }
  } catch (error) {
    console.error("[scheduled-post-worker] Recovery poll failed:", error);
  } finally {
    running = false;
  }
}

export function startScheduledPostWorker(): void {
  if (interval || stopped) {
    return;
  }

  console.info(
    "[scheduled-post-worker] Started; stale-claim recovery is enabled, automatic claiming is disabled.",
  );

  interval = setInterval(() => {
    void pollDuePosts();
  }, POLL_INTERVAL_MS);

  void pollDuePosts();
}

export async function stopScheduledPostWorker(): Promise<void> {
  stopped = true;

  if (interval) {
    clearInterval(interval);
    interval = undefined;
  }

  // Wait for an in-progress recovery operation before MongoDB disconnects.
  while (running) {
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }

  console.info("[scheduled-post-worker] Stopped.");
}
