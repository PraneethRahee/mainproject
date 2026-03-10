# F14: Delivery/Read Status UX

**Open a new chat and paste this prompt. Implement only this subtask.**

## Task
Implement sent/delivered/read indicators. Indicators must update via socket events. Depends on F13.

## Prerequisites (from F13)
- Socket layer connected
- Message thread renders messages
- Socket events: `message:delivered`, `message:read`

## Output
- **Status indicators per message:**
  - Sent: single checkmark or "Sent"
  - Delivered: double checkmark or "Delivered" (when `message:delivered` received)
  - Read: blue/double check or "Read" (when `message:read` received)
- **Socket handlers:**
  - `message:delivered` — payload includes messageId; update that message's status
  - `message:read` — same
- **Visual:** Clear, subtle icons (e.g. check, check-double) near message timestamp
- **Own messages only:** Typically show status only for current user's messages

## Done Criteria
- Sent indicator shows after send
- Delivered updates when socket emits `message:delivered`
- Read updates when socket emits `message:read`
- UI reflects backend delivery/read state

## Socket Events
- `message:delivered` — { messageId }
- `message:read` — { messageId }

## Workspace
`d:\rahul\chatapp\frontend\`

## Reference
`frontend.md`, `antigravity-ide-prompt.md`
