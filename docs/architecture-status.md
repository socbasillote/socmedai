# Image generation architecture and recovery status

| Task | Status | Evidence and limits |
| --- | --- | --- |
| Audit backend architecture | Complete | Admission, MongoDB persistence, execution, status, and recovery traced. |
| Persistent job queue | Implemented | MongoDB admission records and pending assets survive process termination. |
| Workers independent of HTTP | Implemented | Separate image worker executable. |
| Event notifications and fallback polling | Implemented; production rollout pending | One MediaAsset Change Stream per worker, serialized atomic-claim execution, 60-second idle fallback, reconnect and cleanup tests. See [worker reliability and deployment](image-worker-reliability.md). |
| Browser/tab closure does not terminate generation | User verified | User confirmed this works; accepted jobs have no browser dependency. |
| Persistent job status | Implemented | Status, execution phases, leases, attempts, and timestamps are persisted. |
| Ownership and user isolation | Implemented | Authenticated workspace ownership; cross-account tests. |
| Job progress tracking | Implemented | Public stage/label in status and history APIs; Queued, Preparing, Generating, Saving, Ready in UI. These are real stages, not estimated percentages. |
| Recovery after restarts | Implemented with conservative outcomes | Image worker runs recovery at startup and before each batch. Pre-provider jobs can be reclaimed after lease expiry. Verified stored results are reconciled; uncertain provider outcomes require review and are never automatically charged/generated again. |
| Multiple concurrent workers | Supported | Atomic claims and lease fencing; competing-worker tests. Production scaling is not verified by this checklist. |
| Frontend reconnect/status retrieval | Implemented | History restores pending jobs and resumes read-only polling. |

## Composer drafts

New post composers autosave as drafts with `Untitled` when their title is empty.
Autosave accepts unfinished captions and unselected platforms without publishing
or scheduling. A stable composer ID and monotonic revisions deduplicate retries
and prevent stale writes. Explicit Save/Schedule/Publish finalizes the same record
and blocks delayed autosaves.

The browser keeps an account-scoped local outbox, saves during normal editing,
and attempts a keepalive sync on pagehide/visibility changes. Remaining offline
changes sync when the same account reconnects or reopens the app. Browser shutdown
cannot guarantee delivery of a final HTTP request; the persisted outbox protects
that last unsent version. Clearing browser storage removes unsynced device copies.

Image progress and restart recovery require deploying the API and frontend and
restarting the image worker with the rebuilt code.

## Workspace brand kit

Workspace settings include a separately saved Brand kit: role-based hex colors,
heading/body system fonts, a short image-style description, alignment, spacing,
logo placement, and a preferred logo variant. Primary logos use the existing
private upload and preview pipeline; optional light/dark variants use the same
validated immutable PNG storage and ownership checks.

New image admissions snapshot an enabled kit. The worker uses that snapshot for
AI prompt direction, text-label fonts/colors/alignment, and overlay spacing;
per-image logo placement overrides the kit default. Logo branding stays an
explicit per-image choice. Missing variants fall back to the primary logo.
Changing or disabling the kit does not alter queued or completed images.

The settings preview renders quote, announcement, and sale samples with exact
color roles and browser font/layout styling. AI-generated typography and color
placement are guidance rather than guaranteed template rendering. Font fallback
on a host depends on installed system fonts. The application still has no full
post-template editor.
