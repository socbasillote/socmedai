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
