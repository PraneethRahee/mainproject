# B7: RBAC Middleware

**Open a new chat and paste this prompt. Implement only this subtask.**

## Task
Implement role and permission matrix guard. Unauthorized actions must return forbidden. Depends on B5.

## Prerequisites (from B5)
- Auth flow returns JWT with role (admin, member, guest)
- Access token validated on protected routes

## Output
- **Auth middleware:** Extract and verify JWT; attach user/role to request
- **RBAC middleware:** `requireRole('admin')`, `requireRole(['admin','member'])`, etc.
- **Permission matrix:** Map routes/actions to required roles
  - GET /admin/audit-logs: admin only
  - Channel create: member or admin
  - Channel join/leave: member or admin or guest (with scope)
  - Message send: member or admin or guest (in allowed channel)
- **Response:** 403 Forbidden for unauthorized

## Done Criteria
- Admin routes return 403 for non-admin
- Role comes from JWT payload
- Middleware reusable for REST and socket (or socket has equivalent guard)

## Roles
- admin: full access
- member: standard access, no admin routes
- guest: restricted (define scope in B8)

## Workspace
`d:\rahul\chatapp\backend\`

## Reference
`backend.md` §2.1, §4 B7, §5 RBAC
