# Antigravity Backend Subtask Prompts

Use **one prompt per new chat**. Do not mix subtasks in the same chat.

## How to Use

1. Open a **new chat** in Antigravity IDE (or Cursor).
2. Paste the contents of **B1-bootstrap.md**.
3. Let the agent implement B1. Do not ask it to do B2 in the same chat.
4. When B1 is done, open another **new chat**.
5. Paste the contents of **B2-config-secrets.md**.
6. Repeat for B3 through B18.

## Order (Follow Dependencies)

| Step | File | Subtask | Depends On |
|------|------|---------|------------|
| 1 | B1-bootstrap.md | Backend bootstrap | — |
| 2 | B2-config-secrets.md | Config and secrets | B1 |
| 3 | B3-mongo-models.md | Mongo models and indexes | B1 |
| 4 | B4-redis.md | Redis integration | B1 |
| 5 | B5-auth-credentials.md | Auth credentials flow | B2, B3 |
| 6 | B6-mfa.md | MFA implementation | B5 |
| 7 | B7-rbac.md | RBAC middleware | B5 |
| 8 | B8-channel-membership.md | Channel and membership APIs | B3, B7 |
| 9 | B9-message-api.md | Message API core | B3, B8 |
| 10 | B10-message-safety.md | Message safety pipeline | B9 |
| 11 | B11-file-upload.md | File upload ingest | B3 |
| 12 | B12-file-validation.md | File validation guard | B11 |
| 13 | B13-scan-worker.md | Scan worker integration | B11, B12 |
| 14 | B14-file-access.md | File access API | B13, B7 |
| 15 | B15-socket-auth-events.md | Socket auth and events | B5, B8, B9 |
| 16 | B16-audit-logging.md | Audit logging coverage | B5–B15 |
| 17 | B17-security-hardening.md | Security middleware hardening | B5–B16 |
| 18 | B18-deploy-tests.md | TLS profile + deploy runbook + tests | B1–B17 |

## Notes

- Each prompt is self-contained with prerequisites, output, and done criteria.
- Workspace: `d:\rahul\chatapp` (root), `d:\rahul\chatapp\backend` (Node/Express app).
- Reference doc: `backend.md` in project root.
- Stack: Node.js + TypeScript + Express + Socket.IO + MongoDB + Redis.
