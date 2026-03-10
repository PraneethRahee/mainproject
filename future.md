## Antigravity Chat – Next Steps

This document lists the major backend and frontend tasks still ahead, aligned with the implementation sequence.

### Backend – Upcoming

- **File Upload & Safety (B11–B14)**
  - Implement file upload ingest (`POST /files/upload`) with temporary storage and `FileAsset` creation.
  - Validate MIME/extension/magic bytes, sizes, and disallow risky types (executables, scripts).
  - Integrate a scan worker (even if mocked) to transition files through `uploaded → quarantined → scanned_clean/scanned_blocked`.
  - Provide status + download endpoints:
    - `GET /files/:id/status`
    - `GET /files/:id/download`
  - Ensure only `scanned_clean` files can be attached to messages (hooks already exist).

- **Socket Layer (B15)**
  - Add authenticated Socket.IO handshake using the existing JWT helpers (`getUserFromToken`).
  - Implement real-time events:
    - `message:new`, `typing:update`, `presence:update`, `message:delivered`, `message:read`, `channel:updated`.
  - Reuse RBAC + channel membership for socket events (e.g. only channel members can send/subscribe).
  - Keep socket and REST semantics aligned (same roles and membership checks).

- **Audit Logging Coverage (B16)**
  - Extend audit logging beyond auth:
    - Channel creates/joins/leaves.
    - Message sends (maybe aggregated).
    - File uploads, admin actions.
  - Ensure consistent audit schema: actor, action, target, result, IP, user-agent, metadata.

- **Security Hardening & Finalization (B17–B18)**
  - Add security middleware:
    - Helmet, strict CORS, robust input validation, generalized rate limits for auth and message endpoints.
  - TLS/deployment configuration and tests:
    - Minimal integration tests for auth, RBAC, message safety, file access, and socket flows.

### Frontend – Upcoming

- **Auth & Session Polish (F11–F15)**
  - Hook logout into backend (`/auth/logout`) and clear local session.
  - Add “current user” avatar/name in the workspace header.
  - Improve error messaging for auth flows (MFA failures, refresh failures) with user-friendly toasts or banners.
  - Additional hardening for rendering:
    - Dedicated message components that safely render content and system messages.

- **Channel & DM Experience (F11–F14)**
  - Channel create/join/leave UI:
    - Wire the “+” button to call `POST /channels`.
    - Provide join/leave controls and reflect membership in the nav.
  - DM support:
    - Use `GET /users/search` to drive a DM search UI.
    - Create/access DM channels (type `dm`) and surface them in the left column.
  - Real-time updates:
    - Integrate Socket.IO client with the backend events once B15 is in place.
    - Live updates for new messages, typing indicators, presence badges.

- **Message Features & UX (F12–F17)**
  - File attachments:
    - UI to attach files, show upload progress, and display attachment chips in the thread (once B11–B14 are ready).
  - Delivery/read receipts:
    - Visual indicators for delivered/read states based on socket events.
  - Admin & audit:
    - Flesh out `AdminAuditLogs` page with filters, pagination, and detail views.
  - Visual polish:
    - Micro-animations, subtle transitions, accessibility passes (focus states, ARIA where appropriate).

### Integration & Testing

- **End-to-end flows**
  - Register → login → MFA verification → channel join → message send → attachment upload and share.
  - Admin-only paths: audit logs, security checks.

- **Test coverage**
  - Backend:
    - Auth, session rotation + replay.
    - Message safety (XSS payloads, max length, rate limits).
    - File safety lifecycle.
  - Frontend:
    - Basic routing + guards.
    - Session handling, channel navigation, message send/render flows.

