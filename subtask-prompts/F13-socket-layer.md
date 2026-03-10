# F13: Realtime Socket Layer

**Open a new chat and paste this prompt. Implement only this subtask.**

## Task
Implement Socket.IO connection manager and event handlers. Presence, typing, and new-message updates must work in real time. Depends on F9 (can run in parallel with F10–F12).

## Prerequisites (from F9)
- Message thread renders
- Active channel selection
- Auth tokens (F5) for socket auth
- API base URL from env

## Output
- **Connection manager:**
  - Connect to Socket.IO server (same origin or env `VITE_SOCKET_URL`)
  - On connect: emit `auth:resume` with access token
  - Reconnect with auto-retry; re-emit `auth:resume` on reconnect
  - On channel switch: emit `channel:leave` for previous, `channel:join` for new
- **Event handlers:**
  - `message:new` — append new message to thread (or prepend depending on order)
  - `typing:update` — show "X is typing..."
  - `presence:update` — show online/away status
- **Client emits:**
  - `auth:resume`, `channel:join`, `channel:leave`
  - `message:send` (or use REST; socket may duplicate)
  - `typing:start`, `typing:stop` when user types
  - `presence:ping` periodically
- **attachment:status** — update file status when backend emits
- **channel:updated** — refresh channel list

## Done Criteria
- New messages appear in real time
- Typing indicator works
- Presence updates
- Socket reconnects and resumes auth
- No duplicate messages if REST and socket both used

## Socket Events (Reference)
**Client emits:** auth:resume, channel:join, channel:leave, message:send, typing:start, typing:stop, presence:ping
**Server emits:** message:new, message:delivered, message:read, typing:update, presence:update, attachment:status, channel:updated

## Workspace
`d:\rahul\chatapp\frontend\`

## Reference
`frontend.md` §2.5, `antigravity-ide-prompt.md`
