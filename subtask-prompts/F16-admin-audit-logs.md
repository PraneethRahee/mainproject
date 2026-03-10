# F16: Admin Audit Logs Page

**Open a new chat and paste this prompt. Implement only this subtask.**

## Task
Implement admin audit logs page: filtered log table. Admin only; non-admin users blocked. Depends on F6.

## Prerequisites (from F6)
- RBAC guards; `/admin/*` routes protected
- Only `role === 'admin'` can access
- API client with auth

## Output
- **Page:** `/admin/audit-logs`
- **API:** `GET /admin/audit-logs` — returns audit log entries
- **Table:** Columns: actor, action, target, result, timestamp, metadata (or similar per backend)
- **Filters:** Optional filters by action type, date range, actor — if backend supports query params
- **Pagination:** If backend supports
- **Access control:** Route guard ensures only admin; redirect others
- **Nav:** Link in admin section of sidebar (from F6/F7)

## Done Criteria
- Admin can view audit logs
- Non-admin cannot access (redirect or 403)
- Table displays log data
- Filters work if backend supports

## API Contract
- `GET /admin/audit-logs` — admin only; returns array of log entries
- Query params (if supported): `?action=&actor=&from=&to=`

## Workspace
`d:\rahul\chatapp\frontend\`

## Reference
`frontend.md`, `antigravity-ide-prompt.md`, backend.md
