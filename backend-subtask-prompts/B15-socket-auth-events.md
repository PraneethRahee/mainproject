# B15: Socket Auth and Events

**Open a new chat and paste this prompt. Implement only this subtask.**

## Task
Implement auth handshake and event authorization. Live messaging, presence, typing must be stable. Depends on B5, B8, B9.

## Prerequisites (from B5, B8, B9)
- JWT validation
- Channel membership checks
- Message API

## Output
- **Auth handshake:** Client emits `auth:resume` with access token; server validates; attach user to socket
- **channel:join:** Validate token + channel membership; add socket to channel room
- **channel:leave:** Remove from room
- **message:send:** Validate membership; sanitize; persist; broadcast `message:new`
- **typing:start / typing:stop:** Broadcast `typing:update` to channel
- **presence:ping:** Update presence in Redis; broadcast `presence:update`
- **message:delivered / message:read:** Emit when delivery/read acknowledged (if tracking)
- **attachment:status:** Emit when scan status changes (from B13)
- **channel:updated:** Emit when channel metadata changes
- **Reconnect:** Client re-emits auth:resume; server re-attaches user

## Done Criteria
- Unauthenticated socket cannot join channels
- Message send requires channel membership
- Typing and presence events flow
- Reconnect works with auth resume

## Socket Events
**Client emits:** auth:resume, channel:join, channel:leave, message:send, typing:start, typing:stop, presence:ping
**Server emits:** message:new, message:delivered, message:read, typing:update, presence:update, attachment:status, channel:updated

## Workspace
`d:\rahul\chatapp\backend\`

## Reference
`backend.md` §2.5, §4 B15, §5 RBAC socket
