import {
  renewScheduledPublishingLease,
  SCHEDULED_LEASE_DURATION_MS,
} from "./scheduledPublishingLeaseService.js";

export const SCHEDULED_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

export class ScheduledLeaseLostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScheduledLeaseLostError";
  }
}

type HeartbeatOptions = {
  postId: string;
  scheduledClaimId: string;
  intervalMs?: number;
};

/**
 * Runs one scheduled publishing operation while periodically
 * renewing the associated MongoDB lease.
 *
 * The heartbeat never launches another publication attempt.
 */
export async function withScheduledPublishingHeartbeat<T>(
  options: HeartbeatOptions,
  operation: () => Promise<T>,
): Promise<T> {
  const {
    postId,
    scheduledClaimId,
    intervalMs = SCHEDULED_HEARTBEAT_INTERVAL_MS,
  } = options;

  if (
    !Number.isSafeInteger(intervalMs) ||
    intervalMs <= 0 ||
    intervalMs >= SCHEDULED_LEASE_DURATION_MS
  ) {
    throw new Error("Invalid scheduled heartbeat interval.");
  }

  // Verify ownership before invoking the dispatcher.
  const ownsClaim = await renewScheduledPublishingLease({
    postId,
    scheduledClaimId,
  });

  if (!ownsClaim) {
    throw new ScheduledLeaseLostError(
      "Scheduled publishing claim is missing or expired.",
    );
  }

  let stopped = false;
  let heartbeatInFlight: Promise<void> | null = null;
  let ownershipLost = false;

  const renew = async (): Promise<void> => {
    try {
      const renewed = await renewScheduledPublishingLease({
        postId,
        scheduledClaimId,
      });

      if (!renewed) {
        ownershipLost = true;

        console.error("[scheduled-post-worker] Lease renewal rejected.", {
          postId,
        });
      }
    } catch (error) {
      // A database error means ownership cannot be confirmed.
      // Do not automatically retry the external publication.
      ownershipLost = true;

      console.error("[scheduled-post-worker] Lease renewal failed.", {
        postId,
        error,
      });
    }
  };

  const timer = setInterval(() => {
    if (stopped || ownershipLost || heartbeatInFlight) {
      return;
    }

    const task = renew();
    heartbeatInFlight = task;

    void task.finally(() => {
      if (heartbeatInFlight === task) {
        heartbeatInFlight = null;
      }
    });
  }, intervalMs);

  try {
    const result = await operation();

    if (ownershipLost) {
      // The external publishing outcome may already be known
      // and recorded. Do not retry or overwrite its result.
      console.warn(
        "[scheduled-post-worker] Dispatch finished after lease ownership became uncertain.",
        { postId },
      );
    }

    return result;
  } finally {
    stopped = true;
    clearInterval(timer);

    // Ensure no heartbeat update continues after cleanup.
    if (heartbeatInFlight) {
      await heartbeatInFlight;
    }
  }
}
