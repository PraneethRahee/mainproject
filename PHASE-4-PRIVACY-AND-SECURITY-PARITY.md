# Phase 4: Privacy and Security Parity

## Goal
Close major trust and privacy gaps:
- Disappearing messages
- Linked devices/session management
- E2E verification UX
- Chat lock
- Report/block/spam workflows

## Scope
- Security/privacy controls and policy layers.
- User-facing controls for trust and abuse.

## Out of Scope
- Stories
- Voice/video calls
- Growth features

## Implementation Order
1. Block/report/spam workflow
2. Session/device management UI
3. Disappearing messages
4. E2E verification UX
5. Chat lock

## Detailed Tasks

### 1) Block / Report / Spam
- Backend:
  - Block list model and guard checks.
  - Report ingestion endpoint with metadata.
- Frontend:
  - Block/report actions from profile and chat.
  - Hide blocked user messages and prevent sends.

### 2) Linked Devices / Sessions
- Backend:
  - Session listing and revocation endpoint.
  - Track device fingerprint fields.
- Frontend:
  - "Linked devices" page with revoke action.

### 3) Disappearing Messages
- Add per-chat timer settings.
- Background cleanup/expiry handling.
- Clear UI indicator on expiring messages.

### 4) E2E Verification UX
- Expose safety-code/fingerprint display.
- Verify flow between peers.
- Store verification state locally/server-side as designed.

### 5) Chat Lock
- Add app/chat lock settings (PIN now; biometrics later).
- Protect chat open with lock challenge.

## Test Plan
- Blocked user cannot send/receive in blocked context.
- Session revoke invalidates further token refresh.
- Expiry jobs remove/hide timed messages as defined.
- Verification state persists and is visible in UI.

## Done Criteria
- Users can trust controls are real and enforceable.
- Abuse/report actions work end-to-end.
- Security-sensitive paths have tests.

## Mistake Prevention Rules
- Never store sensitive secrets unhashed in DB.
- Avoid relying only on frontend for privacy enforcement.
- Add audit logs for security-critical changes.
