# F11: Attachment Upload UI

**Open a new chat and paste this prompt. Implement only this subtask.**

## Task
Implement attachment upload UI: attach button, upload progress, metadata display. Image/video/PDF/general file upload flow must work. Depends on F10.

## Prerequisites (from F10)
- Message composer with send
- API client with auth
- Workspace frame layout

## Output
- **Attach button:** Opens file picker; accept images, videos, PDFs, office docs, archives, general files
- **Upload:** `POST /files/upload` (multipart); show progress bar
- **Metadata:** Display filename, size, MIME type
- **Preview:** Thumbnail for images/videos where possible
- **Integration:** Attach file ref to message; send with `POST /channels/:id/messages` as `{ content, attachmentIds?: string[] }` when backend supports
- **Blocked types:** Do not allow `.exe`, `.dll`, `.bat`, `.cmd`, `.ps1`, `.sh`, `.js`, `.msi`, `.apk` — show error before upload

## Done Criteria
- User can select and upload image/video/PDF/doc/archive/general files
- Progress shown during upload
- Blocked extensions rejected with clear error
- Uploaded file ID available for message send
- No security status UI yet — that's F12

## API Contract
- `POST /files/upload` — multipart/form-data
- Returns file ID for `attachmentIds` in message

## Attachment Categories
Images, videos, PDFs, office docs, archives, general files.

## Workspace
`d:\rahul\chatapp\frontend\`

## Reference
`frontend.md`, `antigravity-ide-prompt.md`, backend.md §2.3
