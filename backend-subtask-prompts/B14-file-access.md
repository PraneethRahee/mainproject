# B14: File Access API

**Open a new chat and paste this prompt. Implement only this subtask.**

## Task
Implement auth-gated download and status endpoints. Clean files downloadable; blocked denied. Depends on B13, B7.

## Prerequisites (from B13, B7)
- FileAsset with scan status
- RBAC middleware
- Storage path for files

## Output
- **GET /files/:id/status:** Return scan status (uploaded, quarantined, scanned_clean, scanned_blocked); require auth
- **GET /files/:id/download:** Stream file if status is `scanned_clean`; 403 if blocked or quarantined
- **Auth:** Require valid JWT; optionally restrict to owner or channel members
- **Response:** Appropriate headers (Content-Type, Content-Disposition)

## Done Criteria
- Status endpoint returns current scan status
- Download works only for scanned_clean
- Blocked/quarantined return 403
- Auth enforced

## API Contract
- GET /files/:id/status
- GET /files/:id/download

## Workspace
`d:\rahul\chatapp\backend\`

## Reference
`backend.md` §2.3, §2.4, §4 B14
