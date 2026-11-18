import {
  claimNextDuePost,
  releaseUnsubmittedScheduledClaim,
  recoverStalePublishingPosts,
} from "./scheduledPostWorker.js";

import { dispatchScheduledPost } from "../services/publishing/scheduledPublishingDispatcher.js";

import { withScheduledPublishingHeartbeat } from "../services/publishing/scheduledPublishingHeartbeat.js";

import { createScheduledPostWorkerRuntime } from "../workers/scheduledPostWorkerRuntime.js";

const AUTOMATIC_PUBLISHING_ENABLED =
  process.env.SCHEDULED_PUBLISHING_ENABLED === "true";

const runtime = createScheduledPostWorkerRuntime(
  {
    recoverStalePublishingPosts,

    claimNextDuePost,
    releaseUnsubmittedClaim: releaseUnsubmittedScheduledClaim,

    dispatchScheduledPost,

    withHeartbeat: withScheduledPublishingHeartbeat,
  },
  {
    automaticPublishingEnabled: AUTOMATIC_PUBLISHING_ENABLED,

    pollIntervalMs: 5_000,
    concurrency: 4,
    batchSize: 10,
  },
);

export function startScheduledPostWorker(): void {
  runtime.start();
}

export async function stopScheduledPostWorker(): Promise<void> {
  await runtime.stop();
}
