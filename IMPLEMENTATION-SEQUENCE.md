# Antigravity: Interleaved Implementation Sequence

This document defines the recommended execution order when building frontend and backend together. Use **one subtask per new chat**. Cross-dependencies (e.g. F3 Auth UI needs B5 Auth API) drive the interleaving.

---

## Cross-Stack Dependencies

| Frontend Task | Needs Backend | Reason |
|---------------|---------------|--------|
| F3 Auth UI | B5 | POST /auth/login, /auth/register |
| F4 MFA | B6 | POST /auth/mfa/verify |
| F5 Session | B5 | POST /auth/refresh |
| F6 RBAC | B5, B7 | GET /users/me (role), admin routes exist |
| F8 Channel nav | B8 | GET /channels, join, leave |
| F9 Message thread | B9 | GET /channels/:id/messages |
| F10 Composer | B9 | POST /channels/:id/messages |
| F11 Attachment upload | B11 | POST /files/upload |
| F12 Attachment safety | B13, B14 | Scan status, GET /files/:id/status |
| F13 Socket | B15 | Socket server + events |
| F14 Delivery/read | B15 | Socket events |
| F16 Admin logs | B7, B16 | RBAC, GET /admin/audit-logs |

Backend does not depend on frontend.

---

## Recommended Execution Order

Execute in this order. Each step = **one new chat** with the corresponding prompt file.

| Step | Task | Prompt File | Notes |
|------|------|-------------|-------|
| 1 | F1 Bootstrap | subtask-prompts/F1-bootstrap.md | Frontend app shell |
| 2 | B1 Bootstrap | backend-subtask-prompts/B1-bootstrap.md | Backend skeleton |
| 3 | B2 Config | backend-subtask-prompts/B2-config-secrets.md | Env validation |
| 4 | B3 Mongo models | backend-subtask-prompts/B3-mongo-models.md | Schemas + indexes |
| 5 | B4 Redis | backend-subtask-prompts/B4-redis.md | Presence + rate limit |

| 6 | F2 Design system | subtask-prompts/F2-design-system.md | Tokens + base components |

| 7 | B5 Auth credentials | backend-subtask-prompts/B5-auth-credentials.md | Login, register, refresh |
 
| 8 | F3 Auth UI | subtask-prompts/F3-auth-ui.md | Login/register forms |

| 9 | B6 MFA | backend-subtask-prompts/B6-mfa.md | MFA verify endpoint |

| 10 | F4 MFA verify | subtask-prompts/F4-mfa-verify.md | MFA step-up screen |


| 11 | F5 Session handling | subtask-prompts/F5-session-handling.md | Token refresh in API client |


| 12 | B7 RBAC | backend-subtask-prompts/B7-rbac.md | Role guards |

| 13 | F6 RBAC guards | subtask-prompts/F6-rbac-guards.md | Admin route visibility |

| 14 | B8 Channel APIs | backend-subtask-prompts/B8-channel-membership.md | Channels, join, leave |

| 15 | F7 Workspace frame | subtask-prompts/F7-workspace-frame.md | 3-column layout |

| 16 | F8 Channel nav | subtask-prompts/F8-channel-dm-nav.md | Channel list, search |

| 17 | B9 Message API | backend-subtask-prompts/B9-message-api.md | Send, fetch messages |

| 18 | F9 Message thread | subtask-prompts/F9-message-thread.md | Paginated timeline |

| 19 | B10 Message safety | backend-subtask-prompts/B10-message-safety.md | Sanitization, rate limit |

| 20 | F10 Composer | subtask-prompts/F10-message-composer.md | Send message UI |



| 21 | B11 File upload | backend-subtask-prompts/B11-file-upload.md | Upload endpoint |
| 22 | F11 Attachment upload | subtask-prompts/F11-attachment-upload.md | Attach button, progress |
| 23 | B12 File validation | backend-subtask-prompts/B12-file-validation.md | MIME, extension guard |
| 24 | B13 Scan worker | backend-subtask-prompts/B13-scan-worker.md | Quarantine → scan |
| 25 | B14 File access | backend-subtask-prompts/B14-file-access.md | Status + download |
| 26 | F12 Attachment safety | subtask-prompts/F12-attachment-safety.md | Status UI |
| 27 | B15 Socket auth/events | backend-subtask-prompts/B15-socket-auth-events.md | Real-time layer |
| 28 | F13 Socket layer | subtask-prompts/F13-socket-layer.md | Client socket |
| 29 | F14 Delivery/read | subtask-prompts/F14-delivery-read-status.md | Status indicators |
| 30 | F15 Secure rendering | subtask-prompts/F15-secure-rendering.md | XSS hardening |
| 31 | B16 Audit logging | backend-subtask-prompts/B16-audit-logging.md | Audit middleware |
| 32 | F16 Admin audit logs | subtask-prompts/F16-admin-audit-logs.md | Admin page |
| 33 | B17 Security hardening | backend-subtask-prompts/B17-security-hardening.md | Helmet, CORS, throttles |
| 34 | B18 Deploy + tests | backend-subtask-prompts/B18-deploy-tests.md | Runbook, tests |
| 35 | F17 Polish + tests | subtask-prompts/F17-polish-tests.md | Motion, accessibility, tests |

---

## Phase Summary

| Phase | Steps | Focus |
|-------|-------|--------|
| **Phase 1: Bootstrap** | 1–2 | F1, B1 |
| **Phase 2: Backend Foundation** | 3–5 | B2, B3, B4 |
| **Phase 3: Design** | 6 | F2 |
| **Phase 4: Auth** | 7–11 | B5, F3, B6, F4, F5 |
| **Phase 5: RBAC** | 12–13 | B7, F6 |
| **Phase 6: Channels** | 14–16 | B8, F7, F8 |
| **Phase 7: Messaging** | 17–20 | B9, F9, B10, F10 |
| **Phase 8: Attachments** | 21–26 | B11, F11, B12, B13, B14, F12 |
| **Phase 9: Real-time** | 27–29 | B15, F13, F14 |
| **Phase 10: Hardening** | 30–31 | F15, B16 |
| **Phase 11: Admin** | 32 | F16 |
| **Phase 12: Final** | 33–35 | B17, B18, F17 |

---

## Dependency Graph (Simplified)

```
F1 ──┬── F2 ── F7 ── F8 ── F9 ──┬── F10 ── F11 ── F12
     │                          │
     └── F3 ── F4               ├── F13 ── F14
          │    │                └── F15
          └── F5 ── F6 ────────────────────────── F16 ── F17

B1 ── B2 ── B5 ── B6
  ├─ B3 ─┬─ B8 ── B9 ── B10
  └─ B4  └─ B7 ──────────────── B16
        │
        ├── B11 ── B12 ── B13 ── B14
        │
        └── B15 (needs B5,B8,B9)
```

Frontend consumes backend APIs; backend does not depend on frontend.
