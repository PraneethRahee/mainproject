# F10: Message Composer

**Open a new chat and paste this prompt. Implement only this subtask.**

## Task
Implement message composer: text send, validation, keyboard shortcuts. Message send and optimistic state must work. Depends on F9.

## Prerequisites (from F9)
- Message thread renders
- Active channel ID available
- Composer placeholder in layout
- API client (F5)

## Output
- **Composer:** Textarea or contenteditable for message input
- **Send:** Button and/or Enter to send (Shift+Enter for newline)
- **API call:** `POST /channels/:id/messages` with `{ content }`
- **Optimistic UI:** Add message to list immediately; revert on failure
- **Validation:** Max length, trim empty; show error for blocked/rate-limited
- **Keyboard shortcuts:** Enter send, Shift+Enter newline
- **Loading state:** Disable send while submitting

## Done Criteria
- User can type and send messages
- Optimistic update shows message before server confirm
- Validation errors displayed
- Keyboard shortcuts work
- No attachment logic yet — text only

## API Contract
- `POST /channels/:id/messages` — body: `{ content: string }`

## Workspace
`d:\rahul\chatapp\frontend\`

## Reference
`frontend.md`, `antigravity-ide-prompt.md`
