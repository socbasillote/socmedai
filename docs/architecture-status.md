# Image generation architecture and recovery status

| Task | Status | Evidence and limits |
| --- | --- | --- |
| Audit backend architecture | Complete | Admission, MongoDB persistence, execution, status, and recovery traced. |
| Persistent job queue | Implemented | MongoDB admission records and pending assets survive process termination. |
| Workers independent of HTTP | Implemented | Separate image worker executable. |
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
