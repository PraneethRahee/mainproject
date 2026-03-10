# F12: Attachment Safety State UI

**Open a new chat and paste this prompt. Implement only this subtask.**

## Task
Implement attachment safety state UI. Only `scanned_clean` files can be inserted/shared. Show quarantine/blocked states. Depends on F11.

## Prerequisites (from F11)
- Attachment upload UI works
- File IDs returned from upload
- Message composer can include attachment refs

## Output
- **Status polling:** `GET /files/:id/status` returns `uploaded` | `quarantined` | `scanned_clean` | `scanned_blocked`
- **Status components:**
  - `uploaded` / `quarantined`: Show "Scanning..." or spinner
  - `scanned_clean`: Show preview; allow insert into message
  - `scanned_blocked`: Show blocked state, NO preview, do not allow insert
- **Insert rule:** Only `scanned_clean` attachments can be added to messages
- **Socket:** Listen for `attachment:status` if backend emits; update UI
- **Blocked UX:** Clear "File blocked" message, no preview or download link

## Done Criteria
- Quarantine/scanning states show loading indicator
- Only clean files can be shared in chat
- Blocked files show blocked state, no preview
- Status updates via polling or socket

## Security Status Values
- `uploaded`
- `quarantined`
- `scanned_clean` — shareable
- `scanned_blocked` — blocked, no preview

## Workspace
`d:\rahul\chatapp\frontend\`

## Reference
`frontend.md` §2.3, `antigravity-ide-prompt.md`, backend.md §2.3
