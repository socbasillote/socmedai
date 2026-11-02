export type ClaimedScheduledPost = {
  _id: {
    toString(): string;
  };
  scheduledClaimId?: string | null;
};

export type WorkerDependencies = {
  recoverStalePublishingPosts: () => Promise<{
    modifiedCount: number;
  }>;

  claimNextDuePost: () => Promise<ClaimedScheduledPost | null>;

  dispatchScheduledPost: (postId: string) => Promise<unknown>;

  withHeartbeat: (
    options: {
      postId: string;
      scheduledClaimId: string;
    },
    operation: () => Promise<unknown>,
  ) => Promise<unknown>;
};

export type WorkerOptions = {
  automaticPublishingEnabled: boolean;
  pollIntervalMs?: number;
};

export function createScheduledPostWorkerRuntime(
  dependencies: WorkerDependencies,
  options: WorkerOptions,
) {
  const { automaticPublishingEnabled, pollIntervalMs = 5_000 } = options;

  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs <= 0) {
    throw new Error("Invalid worker polling interval.");
  }

  let interval: ReturnType<typeof setInterval> | undefined;
  let activePoll: Promise<void> | null = null;
  let stopped = false;

  /**
   * Process at most one scheduled post.
   *
   * The activePoll reference prevents overlapping cycles.
   */
  function poll(): Promise<void> {
    if (stopped || activePoll) {
      return Promise.resolve();
    }

    const cycle = async (): Promise<void> => {
      try {
        const recovery = await dependencies.recoverStalePublishingPosts();

        if (recovery.modifiedCount > 0) {
          console.warn(
            `[scheduled-post-worker] Recovered ${recovery.modifiedCount} stale claim(s).`,
          );
        }

        if (!automaticPublishingEnabled || stopped) {
          return;
        }

        const claimed = await dependencies.claimNextDuePost();

        if (!claimed) {
          return;
        }

        const postId = String(claimed._id);
        const claimId = claimed.scheduledClaimId;

        if (typeof claimId !== "string" || !claimId.trim()) {
          console.error("[scheduled-post-worker] Missing claim ownership ID.", {
            postId,
          });
          return;
        }

        if (stopped) {
          console.warn(
            "[scheduled-post-worker] Shutdown after claim; dispatch withheld.",
            { postId },
          );
          return;
        }

        try {
          await dependencies.withHeartbeat(
            {
              postId,
              scheduledClaimId: claimId,
            },
            () => dependencies.dispatchScheduledPost(postId),
          );

          console.info(`[scheduled-post-worker] Finished post ${postId}.`);
        } catch (error) {
          console.error(
            `[scheduled-post-worker] Dispatch failed for ${postId}:`,
            error,
          );

          // No automatic retry.
        }
      } catch (error) {
        console.error("[scheduled-post-worker] Polling failed:", error);
      }
    };

    // The async function executes synchronously until
    // its first await. Store its promise as the active cycle.
    const task = cycle();
    activePoll = task;

    void task.finally(() => {
      if (activePoll === task) {
        activePoll = null;
      }
    });

    return task;
  }

  function start(): void {
    if (interval || stopped) {
      return;
    }

    console.info(
      "[scheduled-post-worker] Started; " +
        "stale-claim recovery is enabled, " +
        `automatic claiming is ${
          automaticPublishingEnabled ? "enabled" : "disabled"
        }.`,
    );

    interval = setInterval(() => {
      void poll();
    }, pollIntervalMs);

    void poll();
  }

  async function stop(): Promise<void> {
    stopped = true;

    if (interval) {
      clearInterval(interval);
      interval = undefined;
    }

    // Wait for the active dispatch, including its heartbeat.
    const task = activePoll;

    if (task) {
      await task;
    }

    console.info("[scheduled-post-worker] Stopped.");
  }

  return {
    poll,
    start,
    stop,
  };
}
