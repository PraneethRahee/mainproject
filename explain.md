

### Backend

- **Bootstrap & Config**
  - Created `backend/` Node.js app with Express + Socket.IO (JS, not TS).
  - Added strict config validation (`config.js`) using Zod:
    - Requires `NODE_ENV`, `PORT`, `MONGODB_URI`, `REDIS_URL`, `JWT_SECRET`, `MFA_SECRET`.
    - Fails fast on missing/invalid env.

- **Data Models (Mongo/Mongoose)**
  - Implemented core schemas with indexes:
    - `User`: email, displayName, `passwordHash`, role (`admin|member|guest`), MFA flags, profile.
    - `Session`: user, `refreshTokenHash`, `tokenFamilyId`, device/IP, expiry, revocation.
    - `Channel`: name, description, type (`group|private|dm`), creator, `isArchived`, `lastMessageAt`.
    - `ChannelMember`: channel, user, membership/admin flags.
    - `Message`: channel, sender, content, attachments, delivery/read arrays, timestamps.
    - `FileAsset`: owner, storage key, hash, MIME/ext, size, scan status (`uploaded|quarantined|scanned_clean|scanned_blocked`).
    - `AuditLog`: actor, action, target, result, IP, user-agent, metadata.
  - Added smoke tests for Mongo and Redis.

- **Redis Integration**
  - Central client in `redis.js` with:
    - Presence helpers: `setUserPresence` / `getUserPresence` (TTL-based).
    - Generic rate limiter: `checkRateLimit({ key, limit, windowSeconds })`.

- **Auth, Sessions, MFA, RBAC**
  - JWT helpers (`auth/jwt.js`):
    - Access + refresh tokens, rotation family ids, SHA-256 hashing for refresh tokens.
  - Auth routes (`/auth/*`):
    - `POST /auth/register`: create user with `passwordHash`, log audit.
    - `POST /auth/login`:
      - If MFA disabled → issues access + refresh tokens, creates `Session`.
      - If MFA enabled → returns `{ requiresMfa, tempToken }`.
    - `POST /auth/logout`: revokes refresh session.
    - `POST /auth/refresh`: rotates refresh tokens, detects replay and invalidates family.
  - MFA (`speakeasy`):
    - `POST /auth/mfa/setup`: generates TOTP secret and stores `mfaSecret`.
    - `POST /auth/mfa/verify`: verifies OTP, enables MFA, then issues tokens via session flow.
  - RBAC:
    - `requireAuth` middleware attaches `req.user { id, role, mfaEnabled }`.
    - `requireRole(...)` enforces route-level roles.
    - `getUserFromToken` helper for future Socket.IO auth.
    - Admin-only routes:
      - `GET /admin/audit-logs` (paginated).

- **User & Channel APIs**
  - `GET /users/me`: returns current user profile + role.
  - `GET /users/search?query=`: searches users by email/displayName (for DM search).
  - Channel routes:
    - `GET /channels`: lists non-archived channels where the user is a member.
    - `POST /channels`: member/admin can create channels; creator auto-joined as admin.
    - `POST /channels/:id/join`: join channel (guests barred from private channels).
    - `POST /channels/:id/leave`: leave channel (cannot leave if last admin).
  - Channel membership middleware:
    - `requireChannelMember(param)` ensures user is a member before accessing a channel.

- **Message API + Safety**
  - `GET /channels/:id/messages?limit=&cursor=`:
    - Auth + membership required.
    - Cursor-based pagination using `_id`, returns sanitized messages newest→oldest with `nextCursor`.
  - `POST /channels/:id/messages`:
    - Validates `content` (non-empty string, max 4000 chars).
    - Sanitizes with DOMPurify (allowlist tags/attrs), then strips remaining `<script`/`javascript:` patterns.
    - Validates `attachmentIds` only for `FileAsset` with `scanStatus = 'scanned_clean'`.
    - Enforces Redis-based rate limit per user+channel (20 msgs / 10s).
    - Updates `Channel.lastMessageAt`.

### Frontend

- **Bootstrap & Design System**
  - Vite + React + React Router app in `frontend/`.
  - Global theme (`theme.css`) with CSS variables:
    - Colors (light/dark), typography (Space Grotesk + Manrope), spacing, radii, transitions.
  - Base components:
    - `Button`, `Input`, `Card` wired to tokens.
  - Global layout:
    - `App.jsx` with top nav and route structure.

- **Env & API Client**
  - `frontend/.env`: `VITE_API_BASE_URL=http://localhost:4000`.
  - `config/env.js` uses `VITE_API_BASE_URL` (fallback to `http://localhost:4000`).
  - Session helper (`lib/session.js`):
    - Access token in memory, refresh token in `localStorage`.
    - `apiRequest(path, options)`:
      - Adds `Authorization` header.
      - On 401, performs one refresh (`/auth/refresh`) then retries.
      - `clearSession`, `setSessionTokens`, `getAccessToken`, `getRefreshToken`.

- **Auth UI & MFA**
  - `AppContext`:
    - Tracks `user`, `role`, `userLoading`, plus `refreshUser` and `logout`.
    - On mount (with access token) calls `GET /users/me` via `apiRequest`.
  - Login (`/login`):
    - Validates email/password on client.
    - Calls `POST /auth/login`.
    - If `requiresMfa` → redirects to `/mfa` with `tempToken`.
    - If tokens returned → stores via `setSessionTokens`, refreshes user, navigates to `/chat`.
  - Register (`/register`):
    - Email/password/confirm + optional name; validates and calls `POST /auth/register`.
  - MFA verify (`/mfa`):
    - Accepts `tempToken` + 6-digit code.
    - Calls `POST /auth/mfa/verify`, stores tokens, refreshes user, navigates to `/chat`.
    - Handles missing tempToken gracefully by sending user back to login.

- **RBAC UI Guards**
  - `AdminRoute` component:
    - Uses `role` from context; only `admin` can see admin routes.
    - Non-admin/unauth → redirect to `/chat`.
  - `App.jsx`:
    - Shows “Audit Logs” nav item only for admin.
    - `/admin/audit-logs` wrapped by `AdminRoute`.

- **Workspace Frame & Channel Nav**
  - `Chat.jsx`:
    - 3-column layout (workspace nav, channel/DM list, main thread + composer).
    - Uses design tokens and glassy gradients for a modern look.
    - Channel + DM nav:
      - Loads `GET /channels` via `apiRequest`.
      - Search box filters channels client-side.
      - Active channel highlighted; selecting channel updates main pane.
      - Handles loading/error/empty states.

- **Message Thread & Composer**
  - `Chat.jsx` thread:
    - Loads messages for active channel via `GET /channels/:id/messages`.
    - Stores messages as oldest→newest; displays with:
      - Sender id prefix, timestamp, sanitized text.
      - Date separators between days.
      - Linkified URLs (text only; still safe).
    - Infinite scroll:
      - On scroll near top, uses `nextCursor` to fetch older messages and prepend them while keeping scroll position stable.
    - Loading states:
      - Skeleton shimmer while loading.
      - “Loading older messages…” while paginating.
  - Composer:
    - Multiline textarea:
      - Enter to send, Shift+Enter for newline.
    - Validates text (non-empty, max 4000 chars).
    - Calls `POST /channels/:id/messages` via `apiRequest`.
    - Optimistic UI:
      - Adds a temporary message locally with a temp id.
      - On success, replaces with server message.
      - On failure, removes optimistic message and shows error.

