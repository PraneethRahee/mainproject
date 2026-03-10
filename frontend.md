# Frontend Implementation Plan for Antigravity

## 1) Role and Boundaries
- Implement frontend only.
- Do not change backend contracts without a versioned contract update shared with backend.
- Stack: React + JavaScript + Socket.IO client.
- Goal: modern, appealing, secure internal chat UI that integrates with backend APIs/events.

## 2) Shared Contract Snapshot (Read-Only Unless Coordinated)

### 2.1 Roles and Auth
- Roles: `admin`, `member`, `guest`.
- Auth flow: login -> MFA verify -> access token + refresh token.
- Access token used in API + socket auth resume.
- Refresh token rotation required.

### 2.2 Safe Messaging Rules
- Render only backend-sanitized message content.
- Never use unsanitized `dangerouslySetInnerHTML`.
- Links must open safely (`noopener`, `noreferrer`).
- Show clear validation errors for blocked content/rate limits.

### 2.3 Safe Attachment Rules
- Supported user-facing categories: images, videos, PDFs, office docs, archives, and general files.
- Security status values from backend:
  - `uploaded`
  - `quarantined`
  - `scanned_clean`
  - `scanned_blocked`
- Attachments are shareable in chat only when `scanned_clean`.
- Files flagged `scanned_blocked` must show blocked state and no preview.

### 2.4 API Contract to Consume
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
- `GET /admin/audit-logs` (admin only)

### 2.5 Socket Contract to Consume
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

## 3) UI Direction (Fixed)
- Style: clean modern SaaS chat workspace.
- Typography:
  - Headings: `Space Grotesk`
  - Body/UI: `Manrope`
- Visual language:
  - Soft gradients and subtle glass surfaces.
  - High readability and calm contrast.
  - Rounded cards and structured spacing.
- Motion (modern animations):
  - Staggered list entry animations for message timelines and channel lists.
  - Smooth spring/ease-based panel transitions (drawers, modals, composer).
  - Lightweight loading skeletons with subtle shimmer effect.
  - Micro-interactions: button hover/focus feedback, ripple or scale on tap.
  - Toast and notification slide-in/fade-out.
  - Optimistic UI updates with brief success/error feedback.
  - Respect `prefers-reduced-motion` for accessibility.
- Layout:
  - Desktop: 3-column (`workspace nav`, `channel/DM list`, `conversation pane`).
  - Mobile: stacked layout with bottom composer and drawer navigation.

## 4) Subtask Plan (Small Agent Load: 2-6 Hours Each)

| ID | Subtask | Output | Done Criteria | Depends On |
|---|---|---|---|---|
| F1 | Bootstrap app shell | React+JS app with router/state/env | App runs with route placeholders | - |
| F2 | Design system foundation | Tokens for color/type/spacing/motion | Shared theme + base components ready | F1 |
| F3 | Auth UI (login/register) | Forms + client validation | Successful auth submission and error states | F1 |
| F4 | MFA verify screen | MFA step-up UI | Login completes only after MFA success | F3 |
| F5 | Session handling | Access/refresh flow in API client | Expired access auto-refreshes once | F3 |
| F6 | RBAC UI guards | Role-based route visibility | Admin screens hidden for non-admin users | F5 |
| F7 | Workspace frame | Sidebar/header/thread/composer layout | Responsive layout works on desktop/mobile | F2 |
| F8 | Channel + DM navigation | Channel/DM list + search UI | User can switch active conversation | F7 |
| F9 | Message thread rendering | Paginated timeline with timestamps | Scrolling/pagination stable and readable | F8 |
| F10 | Message composer | Text send, validation, keyboard shortcuts | Message send + optimistic state works | F9 |
| F11 | Attachment upload UI | Attach button + upload progress + metadata | Image/video/pdf/general files upload flow works | F10 |
| F12 | Attachment safety state UI | Quarantine/clean/blocked status components | Only clean files can be inserted/shared | F11 |
| F13 | Realtime socket layer | Connection manager + event handlers | Presence/typing/new-message updates live | F9 |
| F14 | Delivery/read status UX | Sent/delivered/read indicators | Indicators update via socket events | F13 |
| F15 | Secure rendering hardening | XSS-safe message/link rendering | Script payloads do not execute | F9 |
| F16 | Admin audit logs page | Filtered log table (admin only) | Admin can view logs, others blocked | F6 |
| F17 | UI polish + tests | Motion/accessibility pass + test suite | Critical flows pass unit/integration/e2e smoke | F1-F16 |

## 5) Definition of Done (Frontend)
- User can:
  - Login with MFA.
  - Send and receive safe text messages.
  - Send images/videos/PDF and general files through secure upload flow.
  - See attachment security status and blocked-file behavior.
  - Use channel/DM chat with typing/presence/delivery/read states.
- Security and UX:
  - No unsanitized content rendering.
  - Secure token handling in client.
  - Responsive modern UI with smooth, restrained animations.

## 6) Frontend QA Checklist
- Auth and MFA happy and failure paths.
- Session refresh and forced logout behavior.
- XSS payload tests in message content.
- Upload tests for image/video/pdf/doc/archive and blocked executable extension.
- Socket reconnect/resume behavior.
- Mobile layout checks for navigation, thread, composer, and file upload.

## 7) Handoff Artifacts to Keep Updated
- `frontend-api-contract.md` (consumed contract summary)
- `frontend-test-matrix.md` (critical scenario tracking)
- Changelog section for contract version used.
