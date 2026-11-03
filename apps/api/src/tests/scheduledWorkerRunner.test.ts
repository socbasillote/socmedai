import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createScheduledPostWorkerRuntime,
  type WorkerDependencies,
} from "../workers/scheduledPostWorkerRuntime.js";

import { ScheduledLeaseSignal } from "../services/publishing/scheduledPublishingHeartbeat.js";

function createDeferred<T>() {
  let resolve!: (value: T) => void;

  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

function createDependencies(
  overrides: Partial<WorkerDependencies> = {},
): WorkerDependencies {
  return {
    recoverStalePublishingPosts: async () => ({
      modifiedCount: 0,
    }),

    claimNextDuePost: async () => ({
      _id: "test-post-id",
      scheduledClaimId: "test-claim-id",
    }),

    dispatchScheduledPost: async () => undefined,

    withHeartbeat: async (_options, operation) => {
      const lease = new ScheduledLeaseSignal();
      return operation(lease);
    },

    ...overrides,
  };
}

test("worker dispatches a claimed post exactly once", async () => {
  let dispatchCalls = 0;
  let heartbeatCalls = 0;

  const runtime = createScheduledPostWorkerRuntime(
    createDependencies({
      dispatchScheduledPost: async (postId) => {
        assert.equal(postId, "test-post-id");
        dispatchCalls += 1;
      },

      withHeartbeat: async (options, operation) => {
        heartbeatCalls += 1;

        assert.equal(options.postId, "test-post-id");

        assert.equal(options.scheduledClaimId, "test-claim-id");

        return operation(new ScheduledLeaseSignal());
      },
    }),
    {
      automaticPublishingEnabled: true,
    },
  );

  await runtime.poll();

  assert.equal(dispatchCalls, 1);
  assert.equal(heartbeatCalls, 1);

  await runtime.stop();
});

test("worker prevents overlapping publishing cycles", async () => {
  const dispatchStarted = createDeferred<void>();
  const releaseDispatch = createDeferred<void>();

  let claimCalls = 0;
  let dispatchCalls = 0;

  const runtime = createScheduledPostWorkerRuntime(
    createDependencies({
      claimNextDuePost: async () => {
        claimCalls += 1;

        return {
          _id: "test-post-id",
          scheduledClaimId: "test-claim-id",
        };
      },

      dispatchScheduledPost: async () => {
        dispatchCalls += 1;
        dispatchStarted.resolve();
        await releaseDispatch.promise;
      },
    }),
    {
      automaticPublishingEnabled: true,
    },
  );

  const firstPoll = runtime.poll();

  await dispatchStarted.promise;

  // Attempt another poll while dispatch is unresolved.
  await runtime.poll();

  assert.equal(claimCalls, 1);
  assert.equal(dispatchCalls, 1);

  releaseDispatch.resolve();

  await firstPoll;
  await runtime.stop();
});

test("shutdown waits for dispatch and prevents new work", async () => {
  const dispatchStarted = createDeferred<void>();
  const releaseDispatch = createDeferred<void>();

  let dispatchCalls = 0;
  let stopCompleted = false;

  const runtime = createScheduledPostWorkerRuntime(
    createDependencies({
      dispatchScheduledPost: async () => {
        dispatchCalls += 1;
        dispatchStarted.resolve();
        await releaseDispatch.promise;
      },
    }),
    {
      automaticPublishingEnabled: true,
    },
  );

  const activePoll = runtime.poll();

  await dispatchStarted.promise;

  const stopping = runtime.stop().then(() => {
    stopCompleted = true;
  });

  // A stopped worker must not claim or dispatch again.
  await runtime.poll();

  assert.equal(dispatchCalls, 1);
  assert.equal(stopCompleted, false);

  // The current operation is now allowed to finish.
  releaseDispatch.resolve();

  await activePoll;
  await stopping;

  assert.equal(stopCompleted, true);

  // Further polling remains disabled after shutdown.
  await runtime.poll();

  assert.equal(dispatchCalls, 1);
});

test("worker forwards heartbeat ownership signal to dispatcher", async () => {
  let heartbeatSignal: ScheduledLeaseSignal | null = null;
  let dispatcherSignal: ScheduledLeaseSignal | null = null;
  let dispatchCalls = 0;

  const runtime = createScheduledPostWorkerRuntime(
    createDependencies({
      withHeartbeat: async (_options, operation) => {
        const lease = new ScheduledLeaseSignal();

        heartbeatSignal = lease;

        return operation(lease);
      },

      dispatchScheduledPost: async (_postId, lease) => {
        dispatchCalls += 1;
        dispatcherSignal = lease;

        lease.assertOwnership();
      },
    }),
    {
      automaticPublishingEnabled: true,
    },
  );

  await runtime.poll();
  await runtime.stop();

  assert.equal(dispatchCalls, 1);
  assert.ok(heartbeatSignal);
  assert.equal(dispatcherSignal, heartbeatSignal);
});

test("worker never invokes dispatcher after known lease loss", async () => {
  let dispatchCalls = 0;

  const runtime = createScheduledPostWorkerRuntime(
    createDependencies({
      withHeartbeat: async (_options, operation) => {
        const lease = new ScheduledLeaseSignal();

        // Simulate heartbeat detecting invalid ownership
        // before the dispatch callback starts.
        lease.markLost("ownership-rejected");

        return operation(lease);
      },

      dispatchScheduledPost: async () => {
        dispatchCalls += 1;
      },
    }),
    {
      automaticPublishingEnabled: true,
    },
  );

  await runtime.poll();
  await runtime.stop();

  assert.equal(
    dispatchCalls,
    0,
    "Dispatcher must not start after ownership loss.",
  );
});
