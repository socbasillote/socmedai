# Image worker reliability audit and deployment

## Initial audit (before changes)

The repository uses TypeScript source files compiled to JavaScript. The existing
entrypoint is `apps/api/src/workers/imageGenerationWorkerMain.ts`, not a new
serverless handler. Repository-wide searches found no Change Stream subscription
or existing notification/reconnect configuration. No AGENTS.md files were found.

| Category | Findings |
| --- | --- |
| Working; reuse | Entrypoint checks IMAGE_GENERATION_WORKER_ENABLED; mock/live startup separation; parseLiveImageGateConfig and evaluateLiveAdmissionReadiness; provider identity validation; transactional admission; sequential bounded batches; atomic claims; token/lease fencing and heartbeats; conservative retry and reconciliation; immediate startup recovery; MongoDB disconnect after worker cleanup. |
| Partial; improve | Runner used a fixed 5-second polling interval. Non-overlap already worked. Signal handlers were installed after connection. Cleanup waited for a batch that could still start more jobs. Existing runner tests covered startup recovery and recovery failure only. |
| Missing; add | Collection notification filter, cursor lifecycle, coalesced wakeups, reconnect timer, validated fallback/reconnect settings, notification and signal lifecycle coverage, deployment topology check. |

MediaAsset is the persisted job model. Eligibility is determined by
`discoverReservedImageJobs`: pending reserved jobs or expired pre-provider claims,
matching configured provider/model and a committed active credit admission.
`claimImageGeneration` uses conditional findOneAndUpdate with a fresh claim token;
multiple instances cannot win the same valid claim. provider_started operations
are never automatically regenerated. Existing claim and worker integration suites
cover claim races, expired claims, stale tokens, mock execution, provider rejection,
uncertain outcomes, and branding preflight. Those mechanisms were retained.

LIVE_PAID_WORKER_ARMED was already **true**, despite older comments referring to
an unarmed release. Its value and all gate implementations are unchanged. Live
execution still requires enabled and approved rollout configuration, approved
model/provider, API key, billing readiness, admission and ownership checks.

## Implementation plan and result

Extend the existing runner with one MediaAsset collection subscription using the
existing Mongoose connection. Treat events only as wakeup hints; run the same
recovery, discovery and atomic-claim functions. Coalesce notifications, drain
successful full batches immediately, and retain non-overlapping fallback polling.
Reconnect after closing failed cursors. Harden startup/shutdown and test only the
new lifecycle behavior plus existing safety regressions.

Reused without modification: schemas, collections, status transitions, admission,
claim service, heartbeat service, completion/storage and provider integrations,
provider selection gates, retry/reconciliation mechanisms, logging payload rules,
worker scripts and persistent hosting model.

Improved: runner scheduling and backlog throughput, batch cancellation before the
next claim, signal handling during startup, idempotent cleanup, startup-error
MongoDB cleanup, configuration diagnostics and test coverage.

New: filtered Change Stream notifications, cursor reconnection and closure,
notification coalescing, topology diagnostics, timer configuration, and focused
signal/notification tests. No new dependencies or queue services.

## Runtime behavior

- Startup checks existing pending jobs immediately. Recovery still precedes each batch.
- Insert/replace events for pending reserved/claimed assets and relevant status or
  phase updates wake the worker. Dotted update field names are inspected as literal
  keys. Heartbeats, progress and terminal asset changes do not trigger scans.
- The stream projects only its resume token and operation type; the runner never
  receives prompts or provider payloads. Every wakeup rechecks database eligibility.
- A stream's first resume token triggers recovery of the subscription setup gap.
  Failed attempts do not trigger extra job scans. Polling remains independent.
- There is one batch and one subscription per runner. Notifications during work
  request a single follow-up check. Full successful batches drain immediately;
  review-only outcomes wait for recovery instead of looping indefinitely.
- Error/end/close/invalidate events retire and close the cursor before reconnecting.
  The driver can also handle resumable failures internally. Application reconnects
  open a fresh cursor; no resume token is persisted. Durable database scans recover
  missed jobs after reconnection or process restart.
- Polling uses a timeout after each settled batch, approximately 60 seconds while
  idle. Expired leases become eligible through these scans even without an event.
- SIGINT/SIGTERM stop notifications, poll/reconnect timers and additional claims;
  finish an active generation using existing lease mechanisms; await cursor/batch
  cleanup; then disconnect MongoDB. Repeated cleanup calls share a promise.
- Signals during initial connection prevent runner startup. Initial connection
  failure cleans up and exits nonzero; the hosting platform should restart it.

## Configuration

Existing variables retain their names and meaning, including
IMAGE_WORKER_MONGODB_URI and IMAGE_GENERATION_WORKER_ENABLED. Added defaults:

| Variable | Default | Validation |
| --- | --- | --- |
| IMAGE_WORKER_CHANGE_STREAM_ENABLED | true | Exactly true or false |
| IMAGE_WORKER_FALLBACK_POLL_INTERVAL_MS | 60000 | Integer milliseconds, 1000 through 2147483647 |
| IMAGE_WORKER_RECONNECT_DELAY_MS | 5000 | Integer milliseconds, 1000 through 2147483647 |

The existing programmatic runner intervalMs option is retained. Explicit invalid
settings fail startup. Set notifications false for a polling-only deployment.
The 5-second reconnect timer retries subscriptions; it is not a job polling loop.

## Files changed

Modified:
- `.env.example`
- `apps/api/src/workers/imageGenerationWorkerMain.ts`
- `apps/api/src/workers/imageGenerationWorkerRunner.ts`
- `apps/api/src/workers/imageGenerationWorkerRunner.test.ts`
- `apps/api/src/services/imageGenerationWorkerService.ts`
- `apps/api/src/services/imageGenerationWorkerService.integration.test.ts`
- `docs/architecture-status.md`

Created:
- `apps/api/src/workers/imageGenerationWorkerMain.test.ts`
- `docs/image-worker-reliability.md`

## Verification

Commands run from repository root:

```powershell
npm run typecheck --workspace @storm/api
npm run build --workspace @storm/api
npm run test --workspace @storm/api -- src/workers/imageGenerationWorkerMain.test.ts src/workers/imageGenerationWorkerRunner.test.ts src/services/imageGenerationWorkerService.integration.test.ts src/services/mediaGenerationClaimService.integration.test.ts src/services/imageGenerationLiveWorker.integration.test.ts src/services/imageGenerationReconciliation.integration.test.ts src/services/imageGenerationLiveGate.test.ts src/services/imageGenerationLiveAdmissionReadiness.test.ts src/services/imageGenerationWorkerProviderGate.test.ts src/config/imageGenerationConfig.test.ts
```

Typecheck and production build pass. The focused test command passes 122 tests across 10 files.
Integration suites actually launch disposable MongoDB instances, including replica
sets for Change Stream, admission, worker execution and reconciliation tests.
Tests make no paid provider calls and use fake private storage. Existing production
credentials and production databases were not accessed.

Verified: new job notifications, startup pending jobs, missed notification fallback,
real event filtering including dotted phase transitions, duplicate hint coalescing,
competing workers with one provider invocation, subscription errors/closure and
reconnection, polling through subscription/database errors, no overlapping batches,
shutdown waiting for cursor and active work, both signals, connection-time signals,
startup error cleanup, mock image generation and existing live safety gates.

An early sandboxed npm invocation failed before execution because the Node/npm
installation path was inaccessible; running with approved execution access worked.
An intermediate typecheck identified a test-double interface mismatch, which was
corrected before the final passing checks. The entire repository test suite was
not run.

## Deployment and remaining production checks

1. Use the existing persistent Node.js worker service on Railway, Render or an
   equivalent host, with the repository's supported Node version. Install workspace
   dependencies and run `npm run start:image-worker --workspace @storm/api`.
   This script builds the API and starts its existing compiled worker executable.
2. Keep the worker and API pointed at the same intended database. Use a replica set
   or sharded MongoDB deployment for notifications. A standalone server can poll,
   but cannot provide Change Streams. The example localhost URI does not establish
   replica-set support by itself.
3. Confirm the deployed worker logs that topology supports Change Streams. Startup
   uses hello to inspect setName or isdbgrid without logging the URI. A warning
   means topology is unsupported or could not be checked. Topology alone does not
   establish authorization: verify the database user has find and changeStream
   privileges for the MediaAsset collection and notifications actually arrive.
4. Set the new defaults above, enable IMAGE_GENERATION_WORKER_ENABLED, and retain
   the existing provider/admission approvals. For a mock rollout use provider=mock
   and live-enabled=false. Do not copy example live settings as deployment approval.
5. With mock generation first, enqueue a job while idle, confirm immediate pickup,
   restart with a pending job, and disable notifications to verify fallback pickup.
   Test two replicas, a real primary failover/network outage and recovery in staging.
6. Configure the host's graceful termination window to exceed the longest allowed
   generation/storage operation and MongoDB cursor cleanup time. A forced kill can
   interrupt cleanup; existing leases and conservative reconciliation remain the
   recovery mechanism. Monitor pending age, recovery-required jobs and sanitized
   worker errors.

Production topology, user permissions, network failover timing, host termination
limits, scaling load, real Supabase storage and paid provider calls were not tested.
A real primary failover is not equivalent to the simulated stream errors used in
unit tests. Recovery sweeps retain their existing bounded limits and conservative
manual-review outcomes. Notification delivery is best effort; fallback scans are
required. No claim of exactly-once external effects after ambiguous provider
responses is made; the existing durable provider_started boundary prevents blind
regeneration.

Change Streams require a replica set or sharded cluster, as documented in the
[Mongoose Change Stream documentation](https://mongoosejs.com/docs/change-streams.html).
