# Phase 1: Must-Have Chat Polish

## Goal
Ship core messaging polish that users expect immediately:
- Message search in active chat
- Pin/star message
- Delete for everyone
- Better typing/read UX
- Draft persistence per chat

## Scope (Do only this)
- Backend APIs and DB updates for search, pin/star, delete-everyone behavior.
- Frontend UI and interaction updates in chat screen only.
- Tests for new behavior.

## Out of Scope (Do not do here)
- Voice notes
- Calls
- Invite links
- Push notifications
- Mobile app changes

## Implementation Order
1. Message search API and UI
2. Pin/star data model + APIs + UI
3. Delete-for-everyone finalize behavior + UI action
4. Typing/read label improvements
5. Draft persistence (local)
6. Regression tests

## Detailed Tasks

### 1) Message Search
- Backend:
  - Add `GET /messages/:conversationId/search?q=&limit=`.
  - Enforce membership before returning results.
  - Exclude deleted and delete-for-me records.
  - Return latest matches sorted by message time desc.
- Frontend:
  - Add search icon in active chat header.
  - Show right panel with query input and result list.
  - On result click, jump to message if loaded.
  - If not loaded, show clear feedback.

### 2) Pin/Star Messages
- Backend:
  - Add fields: `isPinned`, `isStarredBy` (or dedicated relation).
  - Add APIs:
    - `POST /messages/:id/pin`
    - `POST /messages/:id/unpin`
    - `POST /messages/:id/star`
    - `POST /messages/:id/unstar`
  - Validate permissions for pinning in groups.
- Frontend:
  - Add message actions in message menu.
  - Add pinned section in chat header area.
  - Add starred filter/view.

### 3) Delete for Everyone
- Backend:
  - Keep soft delete approach.
  - Add time window validation (for example 15 minutes).
  - Keep audit log entry for delete action.
- Frontend:
  - Show action only for own messages within allowed window.
  - Update thread item to system text consistently.

### 4) Typing/Read UX
- Replace generic "Someone is typing..." with known display names.
- Show clear read state label for own messages.
- Keep behavior lightweight; avoid extra DB writes.

### 5) Draft Persistence
- Save composer text per channel key in local storage.
- Restore draft when user returns to that chat.
- Clear draft on successful send.

## API Contract Checklist
- Every new endpoint returns:
  - `200/201` success with deterministic shape
  - Structured error `{ error: string }`
- Membership checks before data read/write.
- No secret/internal fields in responses.

## Test Plan
- Backend:
  - Membership guard tests for new endpoints.
  - Search result correctness and ordering.
  - Pin/star and delete-for-everyone permission checks.
- Frontend:
  - Search panel rendering and selection behavior.
  - Pin/star action UI state updates.
  - Draft restore and clear logic.

## Done Criteria
- All Phase 1 tasks complete and demoable.
- No lint errors.
- Existing tests pass + new tests pass.
- Manual sanity run: login, open chat, send/search/pin/delete/draft.

## Mistake Prevention Rules
- Do not modify auth/session token model in this phase.
- Do not mix call/media features here.
- Keep all new APIs behind existing auth + membership middleware.
- Prefer additive schema change (no desstructive migrations).
