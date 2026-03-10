# B5: Auth Credentials Flow

**Open a new chat and paste this prompt. Implement only this subtask.**

## Task
Implement register, login, logout, refresh endpoints. JWT + rotation + revocation must be validated. Depends on B2, B3.

## Prerequisites (from B2, B3)
- Config module with JWT_SECRET
- User and Session models
- Redis (B4) for rate limiting if available

## Output
- **POST /auth/register:** Create user; hash password; return success or error
- **POST /auth/login:** Verify credentials; return `{ requiresMfa: true, tempToken }` or `{ accessToken, refreshToken }` if MFA disabled
- **POST /auth/logout:** Revoke refresh token; invalidate session
- **POST /auth/refresh:** Validate refresh token; issue new access + refresh; rotate token family; invalidate on replay
- **JWT:** Short-lived access token; refresh token with rotation
- **Session:** Store refresh token hash in Session model; check revocation

## Done Criteria
- Register creates user with hashed password
- Login returns tokens or MFA challenge
- Refresh rotates tokens; replay detected and invalidates family
- Logout revokes session
- Auth events audit logged (or stub for B16)

## API Contract
- POST /auth/register — body: { email, password, name? }
- POST /auth/login — body: { email, password }
- POST /auth/logout — body: { refreshToken }
- POST /auth/refresh — body: { refreshToken }

## Workspace
`d:\rahul\chatapp\backend\`

## Reference
`backend.md` §2.1, §4 B5, §5 JWT
