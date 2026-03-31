# Phase 3: Group and Admin Power Features

## Goal
Make group management comparable to mature chat apps:
- Invite link + QR
- Announcement-only groups
- Granular admin permissions
- Join request workflow

## Scope
- Group management backend and group info UI only.
- RBAC/policy enforcement for all admin actions.

## Out of Scope
- Calls
- Status/Stories
- Device linking

## Implementation Order
1. Permission matrix model
2. Invite links + QR
3. Announcement-only mode
4. Join requests
5. Admin management UI completion

## Detailed Tasks

### 1) Permission Matrix
- Add group settings fields:
  - `whoCanSend`
  - `whoCanEditInfo`
  - `whoCanAddMembers`
- Enforce in APIs and sockets.

### 2) Invite Links + QR
- Backend:
  - Generate unique invite token with expiry/revoke.
  - `POST /group/:id/invite-link`, `DELETE /group/:id/invite-link`, `POST /group/join-by-link`.
- Frontend:
  - Show/copy link.
  - QR generation panel.
  - Revoke and regenerate actions.

### 3) Announcement-Only Groups
- Add mode toggle in group settings.
- Enforce post permission for non-admin members.
- Show clear disabled composer state.

### 4) Join Requests
- Backend:
  - Queue requests for private groups.
  - Admin approve/reject endpoints.
- Frontend:
  - Request UI for non-members.
  - Admin review list in group settings.

### 5) Admin UX
- Add actions:
  - promote/demote
  - remove
  - transfer ownership (optional)
- Add audit trail visibility.

## Test Plan
- Policy enforcement tests for every guarded action.
- Invite link misuse checks (expired/revoked/reused).
- Join request lifecycle tests.
- Socket + REST consistency for permission changes.

## Done Criteria
- Group admins can fully control membership and posting policy.
- Non-admins are restricted exactly per policy.
- Invite/join flows are reliable and secure.

## Mistake Prevention Rules
- Enforce permissions both in REST and Socket handlers.
- Never allow last-admin removal/demotion.
- All invite tokens must be revocable and expirable.
