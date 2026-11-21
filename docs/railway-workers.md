# Worker audit and Railway deployment

## Deployment layout

Keep `socmedai-web` and `socmedai-api` on Vercel. Deploy two persistent Railway
services from this repository: `image-worker` and `scheduled-worker`. They share
the API's hosted MongoDB database and Supabase project. The workers do not receive
browser requests, need no public domain or CORS settings, and do not run the API
HTTP server. Neither service is a cron job. Do not set `VERCEL=1` on Railway.

## Audit findings

| Area | Finding and disposition |
| --- | --- |
| Scheduled entry point | Previously available only through the standalone API server. Added `scheduledPostWorkerMain.ts` with configuration checks, startup failure cleanup, signal handling and sanitized startup diagnostics. |
| Image startup | Existing provider gates and shutdown retained. Missing storage service-role key now fails startup instead of leaving a running process that fails every recovery/job. MongoDB server selection now times out after five seconds. |
| Database configuration | Image worker accepts the standard `MONGODB_URI`; existing `IMAGE_WORKER_MONGODB_URI` takes precedence if nonempty. Both workers reject a missing explicit URI rather than relying on localhost. |
| Scheduling safety | Atomic due-post claims, unique claim IDs, lease heartbeats, no dispatch after shutdown, and stale-claim recovery retained. Unknown external publishing results are not automatically retried. |
| Image safety | Admission/billing checks, conditional claims, ownership tokens, heartbeats, provider gates and conservative post-provider reconciliation retained. Change Streams are hints; startup scans and fallback polling recover missed notifications. |
| Redeployment | Separate Railway configurations run Node directly, use one replica, disable sleeping, and allow 600 seconds between SIGTERM and forced termination. Application cleanup drains active work before disconnecting MongoDB. |
| Packaging | Multi-stage Linux Node 22 Docker build installs locked workspace dependencies, compiles once, prunes development dependencies, and runs as the non-root node user. Local secrets, dependencies and build output are excluded from the context. |
| Start scripts | `start:image-worker` now runs compiled JavaScript without rebuilding at runtime. Added `start:scheduled-worker` and `dev:scheduled-worker`. Build before using either production start script locally. |

No provider gates, credit prices, retry semantics or existing production flags
were relaxed. Existing queued live jobs require a live-configured worker; a mock
worker intentionally does not claim them.

## Railway setup

1. Connect the Git repository to two Railway services. Set **Root Directory** to
   the directory containing the root `package.json`, `package-lock.json` and
   `Dockerfile.workers` (normally `/`, not `/apps/api`). If this repository is
   nested in a larger checkout, select that nested directory instead.
2. Set each service's **Config File** path, relative to the repository root:
   - image service: `/deploy/railway/image-worker.json`
   - scheduled service: `/deploy/railway/scheduled-worker.json`
   Adjust these paths if the repository itself is nested. The configs select
   `Dockerfile.workers` and the correct compiled executable. Remove conflicting
   manual build/start command overrides. No build-time secrets are needed.
3. Add runtime variables using the appropriate files in `deploy/railway/` as a
   checklist. Empty fields are placeholders; fill them before deploying.
4. Use one replica per worker initially. Do not configure an HTTP healthcheck or
   public networking: these are background processes. Railway's Active status
   only confirms the container started, so also verify the readiness logs and a
   completed job. The configs restart failures up to ten times; alert on exhausted
   restarts and recurring batch failures.
5. Confirm the effective settings show sleeping disabled and a 600-second drain
   window. If the platform plan restricts a setting, resolve it before production
   use. Keep the worker enabled continuously while jobs are accepted by the API.

The configs use Railway's [config-as-code fields](https://docs.railway.com/config-as-code/reference).
Railway otherwise gives deployments no graceful termination time by default;
see [deployment termination behavior](https://docs.railway.com/deployments/reference#singleton-deploys).

## Shared runtime variables

| Variable | Requirement |
| --- | --- |
| `NODE_ENV` | `production` (also set in the Docker runtime). |
| `MONGODB_URI` | Exact intended database used by the Vercel API, including database name. Use hosted MongoDB with replica-set support for transactional image admission and Change Streams. Allow Railway's outbound access and give its DB user the required read/write and Change Stream privileges. A Railway standalone MongoDB template does not automatically supply replica-set support. |
| `SUPABASE_URL` | Same Supabase project as the API. Required by the shared configuration validator, even for the scheduled executable. |
| `SUPABASE_ANON_KEY` | Same API anon key. Required by shared validation. |
| `SUPABASE_SERVICE_ROLE_KEY` | Required for private image storage; also needed for scheduled publishing that reads private media. Keep it server-side. |
| `WEB_ORIGIN` | `https://socmedai-web.vercel.app`, matching the API. |

Provision the private `storm-media` Supabase bucket and ensure service-role
upload/download access. Keep the API and worker on compatible versions of the
schemas and provider model. Ensure existing schema indexes are created in the
target database, especially MediaAsset idempotency and image accounting unique
indexes. Do not reset the database or run `syncIndexes()` during deployment.

## Image worker

Start command: `node apps/api/dist/workers/imageGenerationWorkerMain.js`.
The optional `IMAGE_WORKER_MONGODB_URI` overrides `MONGODB_URI`; remove a stale
override to avoid processing a different database from the API.

The example variables use mock mode for a staging smoke test. Match the API's
provider/admission configuration. For your existing live deployment, copy these
settings from the Vercel API into the image worker rather than using mock values:

| Variable | Live configuration |
| --- | --- |
| `IMAGE_GENERATION_WORKER_ENABLED` | `true` |
| `IMAGE_GENERATION_PROVIDER` | `openai` |
| `IMAGE_GENERATION_MODEL` | `gpt-image-2` (current application contract) |
| `IMAGE_GENERATION_LIVE_ENABLED` | `true` |
| `IMAGE_GENERATION_LIVE_WORKER_ENABLED` | `true` |
| `IMAGE_GENERATION_LIVE_ROLLOUT` | Existing `internal` or `canary` rollout; `off` prevents startup in live mode. |
| `OPENAI_API_KEY` | Valid server-side provider key. |
| `IMAGE_GENERATION_LIMITS_ENABLED` | Match the API. With limits enabled, current code caps live active jobs at 1 and live daily limit at 5. |
| `IMAGE_GENERATION_LIVE_MAX_ACTIVE` | Match API; default `1`. |
| `IMAGE_GENERATION_LIVE_DAILY_LIMIT` | Match API; default `2`. Values above `5` fail validation when limits are enabled. |
| `IMAGE_GENERATION_LIVE_CREDIT_COST` | Match API; current admission cost is `1`. |

Also match `IMAGE_GENERATION_DAILY_WORKSPACE_LIMIT` and
`IMAGE_GENERATION_MAX_ACTIVE_WORKSPACE` if configured. The Vercel API needs
`IMAGE_GENERATION_HTTP_ENABLED=true` to accept image requests. That flag does not
start a worker on Vercel. Do not enable live execution just to test infrastructure;
use a staging database and mock provider for the initial smoke test.

Notification settings default to `IMAGE_WORKER_CHANGE_STREAM_ENABLED=true`,
`IMAGE_WORKER_FALLBACK_POLL_INTERVAL_MS=60000` and
`IMAGE_WORKER_RECONNECT_DELAY_MS=5000`. Expect a topology-support message, then
`Storm mock image worker connected.` or `Storm gated OpenAI image worker connected.`
The connection message precedes the first recovery sweep; confirm actual job
processing too. See [image worker reliability](image-worker-reliability.md) for
notification and recovery details.

## Scheduled worker

Start command: `node apps/api/dist/workers/scheduledPostWorkerMain.js`.
Set `SCHEDULED_PUBLISHING_ENABLED=true` on both the Railway worker and Vercel API
(the API needs it to accept schedules). Expect the runner's started message and
`[Storm Scheduled Worker] Ready; scheduled publishing enabled.` after connection.

Copy the existing `LINKEDIN_TOKEN_ENCRYPTION_KEY` for LinkedIn and
`FACEBOOK_TOKEN_ENCRYPTION_KEY` for Facebook/Instagram from the API. They must be
the same stable 64-character hexadecimal keys that encrypted stored connections;
generating new keys makes existing tokens unreadable. Set
`FACEBOOK_GRAPH_API_VERSION` to the same supported version as the API, and match
`FACEBOOK_PUBLISHING_ENABLED` if Facebook schedules are enabled. Existing saved
connections must have valid tokens, provider permissions and selected destinations.
The worker uses those saved tokens; OAuth callbacks continue to point to Vercel.

The standalone API entry (`npm start --workspace @storm/api`) also starts a
scheduled runner. Do not start that server as the Railway worker command. Remove
any older persistent scheduled service when replacing it to avoid unexpected
extra consumers. Conditional claims still protect against overlapping instances
during redeploys. Do not change API schedule admission flags to disable an old
runner; stop the old service instead.

## Verification and operations

1. Deploy to staging with the same database/project configured on the staging
   API and workers. Confirm startup without configuration errors or restart loops.
2. In mock image mode, enqueue a new image through the app and confirm its asset
   becomes ready, a private PNG exists, and credit/capacity records settle once.
   Enqueue another while idle to verify notification pickup. Temporarily disable
   Change Streams in staging and verify pickup within the fallback interval.
3. Schedule a post for a provider test account and confirm it is published once.
   This smoke test creates a real external post; use an account you control.
4. Redeploy during an active staging job. Verify claiming stops, existing work
   drains and MongoDB disconnects afterward. Confirm pending jobs survive restart.
5. Monitor pending job age, due schedules, image recovery-required states,
   unknown publishing outcomes, recurring DB/storage errors and restart count.
   A live process alone does not prove the queue is progressing. Inspect provider
   and stored evidence before manually retrying an unknown outcome.

The 600-second drain window accommodates the current 120-second image provider
timeout and normal Instagram preparation, but storage operations and database
outages have no proven end-to-end deadline. A hard kill or infrastructure failure
can still interrupt work. Existing leases and conservative reconciliation handle
that case; they do not guarantee exactly-once external publication or generation.

## Local validation

From the repository root:

```sh
npm ci
npm run build --workspace @storm/api
npm run typecheck --workspace @storm/api
npm run test --workspace @storm/api -- src/workers src/tests/scheduledWorkerRunner.test.ts src/tests/scheduledClaimSafety.test.ts src/tests/scheduledDispatcherSafety.test.ts src/tests/scheduledOrchestratorLease.test.ts src/services/scheduledPostWorker.test.ts src/services/scheduledPostWorkerRunner.test.ts src/services/scheduledPublishingHardening.integration.test.ts src/services/imageGenerationWorkerService.integration.test.ts src/services/mediaGenerationClaimService.integration.test.ts src/services/imageGenerationLiveWorker.integration.test.ts src/services/imageGenerationReconciliation.integration.test.ts src/services/imageGenerationLiveGate.test.ts src/services/imageGenerationLiveAdmissionReadiness.test.ts src/services/imageGenerationWorkerProviderGate.test.ts src/config/imageGenerationConfig.test.ts
docker build -f Dockerfile.workers -t storm-workers .
```

Production start scripts now require the preceding build. For source development,
use `npm run dev:image-worker --workspace @storm/api` or
`npm run dev:scheduled-worker --workspace @storm/api`.

The implementation audit uses disposable MongoDB integration tests with fake
providers/storage. No paid provider call, external publication or production DB
mutation is part of the automated validation. Docker execution, Railway deployment
and real network/storage credentials must be verified in the target environment.

Audit verification result: the production API build and full API typecheck pass.
The targeted lifecycle/claim/lease/dispatch run passes 71 tests across 10 files;
the image integration, scheduled hardening and provider-gate run passes 118 tests
across 9 files (189 total). Docker is not installed in the audit environment, so
the Linux container build and Railway deployment have not been executed here.
