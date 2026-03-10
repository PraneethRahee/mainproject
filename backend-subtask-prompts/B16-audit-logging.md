# B16: Audit Logging Coverage

**Open a new chat and paste this prompt. Implement only this subtask.**

## Task
Implement middleware and structured log schema. Auth, chat, upload, admin actions must be logged. Depends on B5–B15.

## Prerequisites (from B5–B15)
- All major flows implemented
- AuditLog model (B3)

## Output
- **Audit log schema:** actor, action, target, result, timestamp, metadata, IP, device
- **Middleware:** Log auth (login, logout, MFA, refresh, register), chat (message send, channel join/leave), upload (upload, download), admin (audit view)
- **Immutable write:** Append-only; no updates/deletes
- **GET /admin/audit-logs:** Return filtered logs; admin only (B7)

## Done Criteria
- Auth events logged
- Message/channel actions logged
- File upload/download logged
- Admin audit view logged
- Logs have required fields

## AuditLog Fields
actor, action, target, result, timestamp, metadata, IP, device

## Workspace
`d:\rahul\chatapp\backend\`

## Reference
`backend.md` §2.4, §3 AuditLog, §4 B16, §5 Audit logging
