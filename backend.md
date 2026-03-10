# Backend Implementation Plan for Cursor

## 1) Role and Boundaries
- Implement backend only.
- Keep frontend contract stable; if contract changes are required, publish a versioned diff.
- Stack: Node.js + TypeScript + Express + Socket.IO + MongoDB + Redis.
- Goal: secure real-time internal chat backend with safe messaging, safe file sharing, and auditable operations.

## 2) Shared Contract Snapshot (Frozen Unless Coordinated)

### 2.1 Roles and Auth
- Roles: `admin`, `member`, `guest`.
- Auth model:
  - Access JWT (short-lived)
  - Refresh token with rotation/revocation
  - MFA required after credential verification
- Auth events must be audit logged.

### 2.2 Safe Messaging Contract
- Inbound message content is validated and sanitized server-side.
- Persist sanitized representation and return sanitized content to clients.
- Reject payloads violating policy (oversized, invalid format, disallowed content patterns).
- Rate limit message send actions per user/channel.

### 2.3 Safe Attachment Contract
- Allow broad business file categories: images, videos, PDFs, office docs, archives, general files.
- Deny risky executable/script file types by default:
  - `.exe`, `.dll`, `.bat`, `.cmd`, `.ps1`, `.sh`, `.js`, `.msi`, `.apk`
- Validate each upload via:
  - extension policy
  - MIME type
  - magic-byte/signature check
  - size limit
- File lifecycle state machine:
  - `uploaded`
  - `quarantined`
  - `scanned_clean`
  - `scanned_blocked`
- Only `scanned_clean` attachments can be linked into messages.

### 2.4 API Contract
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/mfa/verify`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /users/me`
- `GET /users/search`
- `GET /channels`
- `POST /channels`
- `POST /channels/:id/join`
- `POST /channels/:id/leave`
- `GET /channels/:id/messages`
- `POST /channels/:id/messages`
- `POST /files/upload`
- `GET /files/:id/status`
- `GET /files/:id/download`
- `GET /admin/audit-logs`

### 2.5 Socket Contract
- Client emits:
  - `auth:resume`
  - `channel:join`
  - `channel:leave`
  - `message:send`
  - `typing:start`
  - `typing:stop`
  - `presence:ping`
- Server emits:
  - `message:new`
  - `message:delivered`
  - `message:read`
  - `typing:update`
  - `presence:update`
  - `attachment:status`
  - `channel:updated`

## 3) Data Model Baseline
- `User`
  - identity, role, MFA secret/status, profile data
- `Session`
  - refresh token hash, device info, expiry, revocation state
- `Channel`
  - type (group/private/dm), metadata, creator
- `ChannelMember`
  - channel-user mapping, permission flags
- `Message`
  - channel, sender, sanitized content, attachment refs, delivery/read info
- `FileAsset`
  - owner, storage key, hash, MIME/ext/signature metadata, scan status
- `AuditLog`
  - actor, action, target, result, timestamp, metadata/IP/device

## 4) Subtask Plan (Small Agent Load: 2-6 Hours Each)

| ID | Subtask | Output | Done Criteria | Depends On |
|---|---|---|---|---|
| B1 | Backend bootstrap | Express+TS+Socket.IO skeleton | Health endpoint + socket server online | - |
| B2 | Config and secrets baseline | Env schema + config module | App fails fast on invalid/missing env | B1 |
| B3 | Mongo models and indexes | Core schemas + indexes | CRUD smoke works on all core entities | B1 |
| B4 | Redis integration | Redis client + helper layer | Presence/rate-limit helpers functional | B1 |
| B5 | Auth credentials flow | Register/login/logout/refresh endpoints | JWT + rotation + revocation validated | B2,B3 |
| B6 | MFA implementation | TOTP/OTP challenge + verify APIs | Login blocked until MFA success | B5 |
| B7 | RBAC middleware | Role + permission matrix guard | Unauthorized actions return forbidden | B5 |
| B8 | Channel and membership APIs | Channel CRUD + join/leave | Membership checks enforced | B3,B7 |
| B9 | Message API core | Send/fetch/paginate message endpoints | Sanitized messages persisted and returned | B3,B8 |
| B10 | Message safety pipeline | Validation + sanitization + anti-abuse | XSS/script payloads blocked/sanitized | B9 |
| B11 | File upload ingest | Upload endpoint + quarantine write | Files enter `quarantined` reliably | B3 |
| B12 | File validation guard | MIME/ext/magic-byte/size policy | Disallowed files rejected with reason | B11 |
| B13 | Scan worker integration | Malware scan + status transitions | `scanned_clean`/`scanned_blocked` emitted | B11,B12 |
| B14 | File access API | Auth-gated download and status endpoints | Clean files downloadable, blocked denied | B13,B7 |
| B15 | Socket auth and events | Auth handshake + event authorization | Live messaging/presence/typing stable | B5,B8,B9 |
| B16 | Audit logging coverage | Middleware + structured log schema | Auth/chat/upload/admin actions logged | B5-B15 |
| B17 | Security middleware hardening | Helmet, CORS allowlist, validation, throttles | Abuse and malformed traffic controlled | B5-B16 |
| B18 | TLS profile + deploy runbook + tests | Deployment checklist + test suite | Security and functional tests pass | B1-B17 |

## 5) Security Implementation Requirements
- JWT:
  - short-lived access token
  - refresh token rotation with token family invalidation on replay
- MFA:
  - required in login flow
  - challenge expiry and retry controls
- RBAC:
  - middleware for REST and socket events
  - route/event-level permissions
- Audit logging:
  - immutable write path
  - include actor, action, target, result, and timestamp
- Transport and headers:
  - TLS/SSL at ingress/reverse proxy
  - strict CORS allowlist
  - security headers via Helmet
- Abuse resistance:
  - IP/user rate limits for auth, message send, and upload endpoints
  - brute-force protections for login/MFA endpoints

## 6) Backend Definition of Done
- Functional:
  - 1:1 and channel messaging works with delivery/read state updates.
  - Presence and typing events work over Socket.IO.
  - Images/videos/PDF/general files flow through quarantine + scan + share lifecycle.
- Security:
  - Unsafe message content is neutralized/rejected server-side.
  - Disallowed file types are blocked.
  - Only `scanned_clean` files are shareable/downloadable.
  - JWT, MFA, RBAC, and audit logging are enforced.

## 7) Test Plan (Minimum Required)
- Auth tests: register/login/MFA/refresh/logout and token replay handling.
- RBAC tests: forbidden access to admin/private actions.
- Message safety tests: XSS/script payload handling.
- Upload tests:
  - allowed: image/video/pdf/doc/archive/common binary
  - blocked: executable/script extensions
  - quarantine then scan status transitions
- Socket tests: reconnect/auth resume/presence/typing/message events.
- Audit tests: required events always create logs with expected fields.

## 8) Handoff Artifacts for Frontend Team
- OpenAPI or endpoint contract document.
- Socket event payload contract examples.
- Seed script for demo users/roles/channels.
- Postman collection or equivalent API examples.
