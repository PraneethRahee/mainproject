# B13: Scan Worker Integration

**Open a new chat and paste this prompt. Implement only this subtask.**

## Task
Integrate malware scan and status transitions. Emit `scanned_clean` or `scanned_blocked`. Depends on B11, B12.

## Prerequisites (from B11, B12)
- Files uploaded and validated
- FileAsset in quarantined state
- Storage path known

## Output
- **Scan worker:** Process quarantined files (sync or async queue)
- **Scan logic:** Use ClamAV, VirusTotal API, or stub (mark clean for demo)
- **Status transitions:** `quarantined` → `scanned_clean` or `scanned_blocked`
- **Emit:** `attachment:status` via Socket.IO to relevant clients (or polled via B14)
- **Update FileAsset:** Persist new scan status

## Done Criteria
- Quarantined files transition to scanned_clean or scanned_blocked
- Status persisted in FileAsset
- Clients can get status via GET /files/:id/status (B14) or socket
- Stub scan acceptable for dev (all clean or configurable)

## File Lifecycle
uploaded → quarantined → scanned_clean | scanned_blocked

## Workspace
`d:\rahul\chatapp\backend\`

## Reference
`backend.md` §2.3, §4 B13, §3 FileAsset
