# B17: Security Middleware Hardening

**Open a new chat and paste this prompt. Implement only this subtask.**

## Task
Implement Helmet, CORS allowlist, validation, throttles. Abuse and malformed traffic must be controlled. Depends on B5–B16.

## Prerequisites (from B5–B16)
- All endpoints and socket events implemented

## Output
- **Helmet:** Security headers (X-Content-Type-Options, X-Frame-Options, etc.)
- **CORS:** Strict allowlist; no wildcard for production
- **Validation:** Request body validation (e.g. express-validator, zod) on all POST/PUT
- **Throttles:** Rate limits on auth endpoints (login, MFA, refresh), message send, upload
- **Brute-force protection:** Lock or slow down after failed login/MFA attempts (use Redis)
- **Malformed payloads:** Reject invalid JSON, oversized bodies

## Done Criteria
- Security headers present
- CORS restricts origins
- Invalid bodies rejected
- Rate limits enforced
- Brute-force protection on auth

## Abuse Resistance
- IP/user rate limits for auth, message send, upload
- Brute-force protections for login/MFA

## Workspace
`d:\rahul\chatapp\backend\`

## Reference
`backend.md` §5 Transport and headers, Abuse resistance, §4 B17
