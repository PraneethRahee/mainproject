# B8: Channel and Membership APIs

**Open a new chat and paste this prompt. Implement only this subtask.**

## Task
Implement Channel CRUD and join/leave. Membership checks must be enforced. Depends on B3, B7.

## Prerequisites (from B3, B7)
- Channel, ChannelMember models
- RBAC middleware
- Auth middleware

## Output
- **GET /channels:** List channels user is member of (or public channels)
- **POST /channels:** Create channel; add creator as member; apply RBAC (member/admin can create)
- **POST /channels/:id/join:** Add user to channel; enforce join policy
- **POST /channels/:id/leave:** Remove user from channel
- **Membership checks:** Middleware or helper to ensure user is member before message send/fetch
- **Channel types:** Support group, private, dm

## Done Criteria
- User can create, list, join, leave channels
- Non-members cannot send/fetch messages (guarded in B9)
- Guest: restrict to invite-only or allowed channels per policy

## API Contract
- GET /channels
- POST /channels — body: { name, type, ... }
- POST /channels/:id/join
- POST /channels/:id/leave

## Workspace
`d:\rahul\chatapp\backend\`

## Reference
`backend.md` §2.4, §4 B8, §3 Data Model
