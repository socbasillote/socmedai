# Storm — Initial Data Model

## 1. Authentication and identity

Supabase Auth is the source of truth for authentication, passwords, sessions, and user identity.

MongoDB stores application-specific user profile information. Each profile is linked to a Supabase user through a unique `supabaseUserId`.

The application must never store Supabase passwords in MongoDB.

## 2. UserProfile collection

Fields:

- `_id`: MongoDB ObjectId
- `supabaseUserId`: required, unique string from the verified Supabase user
- `email`: optional email address
- `displayName`: optional display name
- `avatarUrl`: optional avatar URL
- `createdAt`: creation timestamp
- `updatedAt`: last-update timestamp

Rules:

- A profile belongs to exactly one Supabase user.
- Profile creation and updates must use the identity verified by the API.
- Client-submitted Supabase user IDs must not determine profile ownership.

## 3. Workspace collection

Fields:

- `_id`: MongoDB ObjectId
- `name`: required workspace name
- `ownerUserId`: required reference to a UserProfile
- `settings`: workspace-specific configuration
- `createdAt`: creation timestamp
- `updatedAt`: last-update timestamp

Rules:

- Every workspace has exactly one owner.
- A user may own multiple workspaces.
- Workspace names must be validated on the server.
- Workspace access must be checked for every read or mutation.

## 4. WorkspaceMember collection

Fields:

- `_id`: MongoDB ObjectId
- `workspaceId`: required reference to a Workspace
- `userId`: required reference to a UserProfile
- `role`: one of `admin`, `editor`, or `viewer`
- `createdAt`: creation timestamp
- `updatedAt`: last-update timestamp

Rules:

- The `(workspaceId, userId)` pair must be unique.
- Membership grants access only to the associated workspace.
- Workspace owners are represented by `Workspace.ownerUserId`.
- The server must verify membership and role before allowing operations.
- Invitation and membership-management workflows will be implemented separately.

## 5. Authorization principles

- Verify Supabase access tokens on the server.
- Derive the authenticated Supabase user ID from the verified token.
- Resolve the corresponding UserProfile in MongoDB.
- Check workspace ownership or membership before accessing workspace data.
- Never trust a user ID or role supplied by the browser.
- Return appropriate authorization errors without exposing internal details.

## 6. Initial implementation scope

The first implementation will create the three collections and indexes, then implement protected endpoints to list and create workspaces.

Workspace invitations, billing, social account connections, content scheduling, and publishing will be modeled in later phases.

## 7. Post collection

Fields:

- `_id`: MongoDB ObjectId
- `workspaceId`: required reference to a Workspace
- `createdByUserId`: required reference to a UserProfile
- `title`: optional internal post title, maximum 150 characters
- `caption`: required string, initially limited to 10,000 characters
- `mediaIds`: array of media asset ObjectIds, initially empty
- `platforms`: array containing one or more of `facebook`, `instagram`, or `linkedin`
- `status`: one of `draft`, `scheduled`, `publishing`, `published`, or `failed`
- `scheduledAt`: optional scheduled publication timestamp
- `publishedAt`: optional successful publication timestamp
- `createdAt`: creation timestamp
- `updatedAt`: last-update timestamp

Rules:

- Every post belongs to exactly one workspace.
- The server must verify workspace access before reading or modifying posts.
- The creator must be derived from the authenticated user's UserProfile.
- Client-submitted creator IDs must not determine ownership.
- Media references must belong to the same authorized workspace.
- A scheduled post must have a valid future publication time when it is scheduled.
- Status transitions must be validated by the server.
- Failed publishing attempts must not be represented as successfully published.
- Actual publishing integrations will be implemented separately.

Indexes:

- `{ workspaceId: 1, updatedAt: -1 }` for workspace-scoped post listing.
- `{ workspaceId: 1, status: 1, scheduledAt: 1 }` for filtering scheduled content.

Initial scope:

- Create and list workspace-scoped posts.
- Validate post creation and scheduling data.
- Keep publishing and media-upload integrations out of the initial implementation.
