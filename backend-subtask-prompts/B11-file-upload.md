# B11: File Upload Ingest

**Open a new chat and paste this prompt. Implement only this subtask.**

## Task
Implement upload endpoint and quarantine write. Files must enter `quarantined` state reliably. Depends on B3.

## Prerequisites (from B3)
- FileAsset model with scan status
- Auth middleware
- Storage (local disk or S3/equivalent)

## Output
- **POST /files/upload:** Multipart upload; store file to quarantine area; create FileAsset with status `quarantined`
- **FileAsset fields:** owner, storage key, hash, MIME/ext, scan status
- **Initial status:** `quarantined` (or `uploaded` then immediately `quarantined`)
- **Auth:** Require valid JWT; set owner from user
- **Response:** Return file ID for client

## Done Criteria
- Upload accepts multipart; file stored
- FileAsset created with quarantined status
- Owner and metadata set
- No extension/MIME validation yet (that's B12)

## API Contract
- POST /files/upload — multipart/form-data

## Workspace
`d:\rahul\chatapp\backend\`

## Reference
`backend.md` §2.3, §4 B11, §3 FileAsset
