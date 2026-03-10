# Antigravity IDE Prompt

Copy everything below the line and paste it into Antigravity IDE.

---

Build the Antigravity chat frontend from scratch per this specification. Implement a modern, secure internal chat UI using React, JavaScript, and Socket.IO client. Frontend only — do not change backend contracts.

## Stack
React + JavaScript + Socket.IO client. Use Vite or Create React App for the project scaffold.

## Auth and Roles
- Roles: `admin`, `member`, `guest`
- Auth flow: login → MFA verify → access token + refresh token
- Use access token in API requests and socket auth resume
- Refresh token rotation required

## API Endpoints to Consume
POST /auth/register, /auth/login, /auth/mfa/verify, /auth/refresh, /auth/logout
GET /users/me, /users/search, /channels, /channels/:id/messages
POST /channels, /channels/:id/join, /channels/:id/leave
POST /channels/:id/messages
POST /files/upload
GET /files/:id/status, /files/:id/download
GET /admin/audit-logs (admin only)

## Socket Events
**Emit:** auth:resume, channel:join, channel:leave, message:send, typing:start, typing:stop, presence:ping
**Listen:** message:new, message:delivered, message:read, typing:update, presence:update, attachment:status, channel:updated

## Security Rules
- Render only backend-sanitized message content. Never use dangerouslySetInnerHTML
- Links: rel="noopener noreferrer"
- Attachments shareable only when status is scanned_clean; show blocked state for scanned_blocked

## UI Design
- Style: clean modern SaaS chat workspace
- Typography: Space Grotesk (headings), Manrope (body)
- Visual: soft gradients, glass surfaces, rounded cards, calm contrast
- Motion: staggered list animations, spring transitions, shimmer skeletons, micro-interactions, toasts, respect prefers-reduced-motion
- Layout: desktop 3-column (workspace nav, channel/DM list, conversation pane); mobile stacked with bottom composer and drawer

## Implementation Order (follow dependencies)
F1: Bootstrap app shell → F2: Design tokens/base components → F3: Auth UI → F4: MFA screen → F5: Session handling → F6: RBAC guards → F7: Workspace frame → F8: Channel/DM nav → F9: Message thread → F10: Composer → F11: Attachment upload → F12: Attachment safety UI → F13: Socket layer → F14: Delivery/read indicators → F15: Secure rendering → F16: Admin audit logs → F17: Polish + tests

## Definition of Done
- Login with MFA, send/receive safe messages, upload files with status display
- Typing, presence, delivery/read states in channel/DM chat
- No unsanitized rendering, secure token handling, responsive UI with modern animations
- RBAC: admin screens hidden for non-admin

Start with F1 and proceed in order. Use the dependency chain (e.g., F7 depends on F2; F9 depends on F8). Ensure all QA items pass: auth/MFA paths, session refresh, XSS safety, upload tests, socket reconnect, mobile layout.
