# F6: RBAC UI Guards

**Open a new chat and paste this prompt. Implement only this subtask.**

## Task
Implement role-based route visibility. Admin-only screens must be hidden from non-admin users. Depends on F5.

## Prerequisites (from F5)
- Session handling works; user data (including `role`) available after auth
- `GET /users/me` returns `{ ...user, role: 'admin' | 'member' | 'guest' }`

## Output
- **Auth context/state:** Expose `user` and `role` (admin, member, guest)
- **Route guards:** Protect `/admin/*` routes — only `role === 'admin'` can access
- **Navigation:** Hide admin nav items (e.g. "Audit Logs") for non-admin
- **Fallback:** Non-admin navigating to `/admin/audit-logs` → redirect to chat or 403 page

## Done Criteria
- Admin sees admin nav and can access admin routes
- Member and guest do not see admin nav; direct URL access redirects away
- Role comes from `/users/me` or decoded token

## Roles
- `admin` — full access including admin routes
- `member` — standard user, no admin
- `guest` — restricted (same visibility rules as member for admin routes)

## Workspace
`d:\rahul\chatapp\frontend\`

## Reference
`frontend.md`, `antigravity-ide-prompt.md`
