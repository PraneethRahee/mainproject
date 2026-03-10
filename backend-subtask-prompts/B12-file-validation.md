# B12: File Validation Guard

**Open a new chat and paste this prompt. Implement only this subtask.**

## Task
Implement MIME/ext/magic-byte/size policy. Disallowed files must be rejected with reason. Depends on B11.

## Prerequisites (from B11)
- File upload ingest
- File stored before or after validation (reject before write if preferred)

## Output
- **Extension policy:** Deny: `.exe`, `.dll`, `.bat`, `.cmd`, `.ps1`, `.sh`, `.js`, `.msi`, `.apk`
- **Allow:** Images, videos, PDFs, office docs, archives, general files
- **MIME type check:** Validate Content-Type matches allowed set
- **Magic-byte check:** Verify file signature matches extension/MIME
- **Size limit:** Reject oversize (e.g. 50MB max)
- **Response:** 400 with reason (e.g. "Disallowed file type: .exe")

## Done Criteria
- Disallowed extensions rejected
- MIME mismatch rejected
- Oversize rejected
- Allowed categories pass validation

## Denied Extensions
.exe, .dll, .bat, .cmd, .ps1, .sh, .js, .msi, .apk

## Workspace
`d:\rahul\chatapp\backend\`

## Reference
`backend.md` §2.3, §4 B12, §5
