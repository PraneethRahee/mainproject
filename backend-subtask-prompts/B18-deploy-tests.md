# B18: TLS Profile + Deploy Runbook + Tests

**Open a new chat and paste this prompt. Implement only this subtask.**

## Task
Create deployment checklist and test suite. Security and functional tests must pass. Depends on B1–B17.

## Prerequisites
- All previous subtasks B1–B17 implemented
- Backend runs end-to-end

## Output
- **TLS profile:** Document TLS/SSL at ingress (e.g. nginx, reverse proxy); no TLS in Node if behind proxy
- **Deploy runbook:** Steps to deploy (env, migrations, start command, health check)
- **Test suite:**
  - Auth: register, login, MFA, refresh, logout, token replay
  - RBAC: forbidden access to admin/private actions
  - Message safety: XSS/script payload handling
  - Upload: allowed (image, video, pdf, doc, archive), blocked (exe, etc.), quarantine→scan transitions
  - Socket: reconnect, auth resume, presence, typing, message events
  - Audit: required events create logs with expected fields

## Done Criteria
- Deployment checklist usable
- Security and functional tests pass
- No regressions in critical paths

## Test Plan (from spec)
- Auth tests, RBAC tests, message safety, upload, socket, audit

## Workspace
`d:\rahul\chatapp\backend\`

## Reference
`backend.md` §5 TLS, §7 Test Plan, §4 B18
