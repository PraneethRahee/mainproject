# B9: Message API Core

**Open a new chat and paste this prompt. Implement only this subtask.**

## Task
Implement send, fetch, paginate message endpoints. Sanitized messages must be persisted and returned. Depends on B3, B8.

## Prerequisites (from B3, B8)
- Message, Channel, ChannelMember models
- Channel membership APIs
- Auth + RBAC middleware

## Output
- **POST /channels/:id/messages:** Send message; validate user is channel member; persist sanitized content; return message
- **GET /channels/:id/messages:** Paginate messages (cursor or offset); return sanitized content only
- **Sanitization:** Use library (e.g. DOMPurify, isomorphic-dompurify) or allowlist; strip scripts, event handlers; store sanitized version
- **Attachment refs:** Accept `attachmentIds`; validate only `scanned_clean` files can be linked
- **Membership:** Reject send if user not in channel

## Done Criteria
- Messages persisted with sanitized content
- Fetch returns paginated, sanitized messages
- Non-member cannot send or fetch
- Attachment refs validated (only scanned_clean)

## API Contract
- POST /channels/:id/messages — body: { content, attachmentIds? }
- GET /channels/:id/messages — query: ?limit=&cursor=

## Workspace
`d:\rahul\chatapp\backend\`

## Reference
`backend.md` §2.2, §4 B9, §3 Message
