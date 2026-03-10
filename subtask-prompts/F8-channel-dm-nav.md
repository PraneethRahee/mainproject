# F8: Channel + DM Navigation

**Open a new chat and paste this prompt. Implement only this subtask.**

## Task
Implement channel and DM list with search UI. User must be able to switch active conversation. Depends on F7.

## Prerequisites (from F7)
- Workspace frame with 3-column layout
- Column 2 reserved for channel/DM list
- Composer and thread area in column 3

## Output
- **Channel list:** Fetch `GET /channels`; display channels; click to select active channel
- **DM list:** Integrate with channels (or user search) — DMs are channels with type `dm`
- **Search:** Search UI to find channels or users (`GET /users/search` for DMs)
- **Active state:** Clear indication of selected channel/DM
- **Create channel:** Button/link to create channel (calls `POST /channels` when implemented)
- **Join/Leave:** `POST /channels/:id/join`, `POST /channels/:id/leave` when user acts

## Done Criteria
- User can see channels and switch active conversation
- Search works for channels/users
- Active conversation highlighted
- List updates when switching; thread header updates with selection

## API Contract
- `GET /channels` — list channels
- `GET /users/search` — search users for DM
- `POST /channels` — create channel
- `POST /channels/:id/join`, `POST /channels/:id/leave`

## Workspace
`d:\rahul\chatapp\frontend\`

## Reference
`frontend.md`, `antigravity-ide-prompt.md`
