# Storm

Storm is an AI-powered social media management application for creating
branded content, managing social accounts, and publishing or scheduling posts.

## Workspace settings

Open **Workspace settings** from the workspace selector or sidebar. General
Settings saves the workspace name, description, IANA timezone, content language,
and a separate avatar (PNG/JPG/WebP, up to 120 KB, normalized to 128 × 128 WebP).
The branding logo remains independent.

Social Accounts lists Facebook Pages and the connected LinkedIn account, with
status, reconnection, and optional default destinations. Unavailable or expired
connections cannot be saved as defaults. Instagram defaults and approval
requirements are unavailable in this settings release.

Publishing Preferences supplies defaults for new posts only. Manual selections,
calendar dates, and existing drafts take precedence. Preferred times suggest the
next eligible slot; allowed weekdays, minimum notice, and maximum advance are
validated by the API for new schedules and reschedules. Existing schedules are
not changed. New-post times use the workspace timezone, including daylight-saving
transitions; nonexistent local times are rejected. The content-language selector
starts with the workspace language and remains editable.

The danger zone requires the exact workspace name. Archive preserves content and
can be reversed in settings. Archive and deletion require no scheduled posts,
active publishing, or pending image generation. Deletion hides the workspace from
the app and cannot be reversed through its UI; database records and private media
are retained. Neither action deletes published social posts or revokes access at
the provider. No database migration is required for existing workspaces.

Run workspace settings checks from each app directory:

```powershell
# apps/api
node ../../node_modules/vitest/vitest.mjs run src/services/workspaceSettings.integration.test.ts
# apps/web
node ../../node_modules/vitest/vitest.mjs run src/components/WorkspaceSettingsView.test.tsx src/components/PostEditorRoute.defaults.test.tsx src/lib/workspaceSettings.test.ts
```

## Technology stack

- Frontend: React, TypeScript, Vite, Tailwind CSS
- API: Node.js, TypeScript, Express
- Database: MongoDB Community Server with Mongoose
- Authentication and file storage: Supabase
- AI content and image generation: OpenAI API
- Image processing: Sharp
- Background publishing: Separate Node.js worker

## Repository structure

- `apps/web` — Web application
- `apps/api` — Backend API and publishing worker
- `packages/shared` — Shared types, schemas, and constants
- `docs` — Project documentation

## Prerequisites

- Node.js 22.14.0 or later
- npm
- Git
- MongoDB Community Server

MongoDB Compass can be used to inspect the local database.

## Getting started

Install workspace dependencies from the repository root:

```powershell
npm install
```

## Caption generation limits

All caption generation and revision endpoints share a MongoDB-backed budget of
100 provider attempts per authenticated user per UTC day and two concurrent
requests. Failed provider attempts count toward the daily budget. Concurrency
slots expire after 60 seconds if an API process crashes; provider calls have a
30-second timeout. Exhausted budgets return HTTP 429 with `Retry-After`.

API reads have a separate allowance of 300 requests per IP per minute; mutations
retain the 150-per-15-minute allowance. Image polling honors HTTP 429 backoff.
LinkedIn connection setup requires cookies and a top-level redirect back to the
API callback; the browser cookie must match the initiating authorization state.

## Publishing images

The post editor can publish a caption with one selected Media Library or
AI-generated image to a Facebook Page or a LinkedIn member account using **Now**.
The server rechecks image ownership, verifies its stored checksum, and uploads
the image directly to the selected provider. Images from another workspace you
own remain supported. Publishing copies are converted to JPEG with a maximum
4096-pixel edge and a 10 MB size limit; original stored images are preserved.

Scheduled Facebook and LinkedIn posts remain text-only; Instagram schedules require one image. Video and multiple-image publishing are not
supported. Provider requests are not automatically retried when a public post's
outcome is uncertain.

## Frontend loading and caching

Routes and larger editor/studio tools load on demand. Workspace lists are cached
in memory for 60 seconds, connection status for 15 seconds, and image access URLs
for 45 seconds (the server signs them for 60 seconds). Cache entries are scoped to
the access token, bounded to 200 entries, and cleared on account changes, sign-out,
explicit refresh, and API mutations. Generation status, credits, and post lists
are not cached. The Media Library requests private preview URLs in a single batch.

Post lists load only for Overview and Posts. Search waits 300 ms after typing,
and obsolete list/pagination requests are aborted. Concurrent API authentication
checks share a live Auth request; completed authentication decisions are not
cached, preserving the existing account-state verification policy.

For production hosting, serve hashed `assets/` files with long-lived immutable
cache headers and gzip/Brotli compression, while revalidating `index.html` so new
releases can discover updated chunks. Keep old hashed chunks available during
rolling releases. Actual transfer and interaction times should be profiled on
the deployed site with mobile network/CPU throttling.

## Scheduled publishing safety

Scheduling validates platform caption limits (Facebook: 5,000 characters;
LinkedIn: 3,000) and requires LinkedIn credentials to remain valid through the
scheduled time. Post details provide Cancel schedule (returns to drafts) and
Reschedule. Both operations reject posts already claimed by a worker.

The scheduler drains up to 40 due posts per polling batch using four concurrent
claim lanes. Shutdown releases owned claims only when no platform work has begun.
Global due-time and lease-expiration indexes support polling and recovery.

Uncertain attempts use status `unknown`, displayed as Needs review. Publication
results are saved as append-only attempt evidence before lease-bound finalization.
Reconciliation can recover a confirmed result for the same scheduled claim
without submitting a new social post. If no evidence exists, inspect the
destination; automatic retries remain disabled.

## Instagram publishing

Instagram professional accounts linked to a connected Facebook Page support
publishing now and scheduling one image with a caption (maximum 2,200 characters).
Reels, Stories, carousels, and personal Instagram accounts are not supported.

Configure the existing Facebook app, Graph API version, token encryption key,
and Supabase private media storage. The Facebook Login flow now also requests
`instagram_basic` and `instagram_content_publish`, alongside the existing Page
permissions. Existing users must reconnect Facebook to grant these permissions.
Meta app access/review requirements still apply to the accounts using the app.

In the post editor, select Instagram, choose a connected Facebook Page under
"Connect or refresh Instagram", then explicitly select the discovered Instagram
account. Attach one saved image, enter the caption, and choose Now or Schedule.
Scheduling uses the existing worker and requires `SCHEDULED_PUBLISHING_ENABLED=true`.
Instagram publishing is configured by default and does not depend on the Facebook
publishing feature flag.

Images are converted to a 1080 x 1080 JPEG with white padding, without cropping.
A private temporary copy is shared with Meta through a ten-minute signed URL,
then removed when processing completes. Source assets remain private. Cleanup
failures are logged with the temporary storage key; operators should remove old
objects under `publishing/instagram/` after an interrupted worker or failed cleanup.
Container processing is bounded; the final publish request is never automatically
retried when its outcome is uncertain. The post then needs review on Instagram.

Live image generation is available in every workspace owned by the authenticated
user. `IMAGE_GENERATION_LIVE_WORKSPACE_ALLOWLIST` is no longer used and can be
removed from existing environments. Provider activation flags, workspace
ownership checks, credit billing, and configured usage limits still apply.
Restart the API and image worker after updating to this version.

Image generation quotas are currently disabled by default. Set
`IMAGE_GENERATION_LIMITS_ENABLED=true` and restart the API and image worker to
restore the configured daily and active-job limits. Usage counters and credit
billing remain active while quotas are disabled. The usage API returns `null`
for disabled limits, and the UI displays Unlimited.

See [architecture status](docs/architecture-status.md) for generation progress, restart recovery, browser-close verification, and composer draft autosave behavior.

Image Studio and the post composer accept an optional private JPG/PNG/WebP photo
(up to 10 MB) for visual inspiration, editing the actual photo, or designing
around its subject. References are normalized to PNG with metadata removed,
scoped to the authenticated owner and workspace, and stored independently of the
browser before a job is admitted. The queued request snapshots the reference ID,
checksum, and selected usage; retries retain the same input. Workers verify the
stored bytes before calling the image provider. Referenced jobs use the Images
edit endpoint with the actual image bytes; text-only jobs use generation.
Reference uploads do not debit image credits. Private source files are retained
for queued jobs and recovery; removing a photo from the form removes it from the
next request, rather than deleting the source of an existing job.

Run `npm run start:image-worker --workspace @storm/api` to build and start the
current worker. During local development use `npm run dev:image-worker --workspace
@storm/api` to restart the worker when its source changes. Rebuilding files alone
does not update an already-running Node worker. Expired post-provider leases are
reported as interrupted, and old pending records without active admissions are
reported as inactive rather than shown as indefinitely queued. Recovery verifies
existing stored image checksums and never repeats an uncertain provider call.
