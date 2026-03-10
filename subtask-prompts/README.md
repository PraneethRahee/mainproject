# Antigravity Frontend Subtask Prompts

Use **one prompt per new chat**. Do not mix subtasks in the same chat.

## How to Use

1. Open a **new chat** in Antigravity IDE (or Cursor).
2. Paste the contents of **F1-bootstrap.md**.
3. Let the agent implement F1. Do not ask it to do F2 in the same chat.
4. When F1 is done, open another **new chat**.
5. Paste the contents of **F2-design-system.md**.
6. Repeat for F3 through F17.

## Order (Follow Dependencies)

| Step | File | Subtask | Depends On |
|------|------|---------|------------|
| 1 | F1-bootstrap.md | Bootstrap app shell | — |
| 2 | F2-design-system.md | Design system | F1 |
| 3 | F3-auth-ui.md | Auth UI (login/register) | F1 |
| 4 | F4-mfa-verify.md | MFA verify screen | F3 |
| 5 | F5-session-handling.md | Session handling | F3 |
| 6 | F6-rbac-guards.md | RBAC UI guards | F5 |
| 7 | F7-workspace-frame.md | Workspace frame | F2 |
| 8 | F8-channel-dm-nav.md | Channel + DM navigation | F7 |
| 9 | F9-message-thread.md | Message thread rendering | F8 |
| 10 | F10-message-composer.md | Message composer | F9 |
| 11 | F11-attachment-upload.md | Attachment upload UI | F10 |
| 12 | F12-attachment-safety.md | Attachment safety UI | F11 |
| 13 | F13-socket-layer.md | Realtime socket layer | F9 |
| 14 | F14-delivery-read-status.md | Delivery/read status UX | F13 |
| 15 | F15-secure-rendering.md | Secure rendering | F9 |
| 16 | F16-admin-audit-logs.md | Admin audit logs | F6 |
| 17 | F17-polish-tests.md | UI polish + tests | F1–F16 |

## Notes

- Each prompt is self-contained with prerequisites, output, and done criteria.
- Workspace: `d:\rahul\chatapp` (root), `d:\rahul\chatapp\frontend` (React app).
- Reference docs: `frontend.md`, `antigravity-ide-prompt.md` in project root.
