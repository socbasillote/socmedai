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
