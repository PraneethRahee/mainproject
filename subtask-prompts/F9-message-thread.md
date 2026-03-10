# F9: Message Thread Rendering

**Open a new chat and paste this prompt. Implement only this subtask.**

## Task
Implement paginated message timeline with timestamps. Scrolling and pagination must be stable and readable. Depends on F8.

## Prerequisites (from F8)
- Active channel/DM selection works
- Thread area in workspace frame
- API client with auth (F5)

## Output
- **Message list:** Fetch `GET /channels/:id/messages` with pagination (cursor or offset)
- **Render messages:** Sender, content (text only — use safe rendering; no dangerouslySetInnerHTML)
- **Timestamps:** Per message and/or date separators
- **Pagination:** Load more on scroll-up (infinite scroll)
- **Scroll behavior:** Maintain scroll position when loading older messages
- **Empty state:** Placeholder when no messages
- **Loading skeleton:** Shimmer skeleton while loading

## Done Criteria
- Messages display in chronological order
- Pagination loads older messages on scroll up
- Timestamps visible
- No XSS — render backend-sanitized text only; links use `rel="noopener noreferrer"`
- Stable scroll when prepending old messages

## Security (F15 will harden)
- Never use `dangerouslySetInnerHTML`
- Render only backend-sanitized content
- Links: `target="_blank" rel="noopener noreferrer"`

## API Contract
- `GET /channels/:id/messages` — query: `?limit=&cursor=` or similar

## Workspace
`d:\rahul\chatapp\frontend\`

## Reference
`frontend.md`, `antigravity-ide-prompt.md`
