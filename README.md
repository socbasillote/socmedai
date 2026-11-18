# Storm

Storm is an AI-powered social media management application for creating
branded content, managing social accounts, and publishing or scheduling posts.

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

Scheduled posts remain text-only. Video and multiple-image publishing are not
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
