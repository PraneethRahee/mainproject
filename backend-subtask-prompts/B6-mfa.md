# B6: MFA Implementation

**Open a new chat and paste this prompt. Implement only this subtask.**

## Task
Implement TOTP/OTP challenge and verify APIs. Login must be blocked until MFA success. Depends on B5.

## Prerequisites (from B5)
- Auth credentials flow; login returns MFA challenge when MFA enabled
- User model with MFA secret storage
- Config for MFA secret/issuer

## Output
- **POST /auth/mfa/verify:** Accept tempToken + OTP code; validate TOTP; on success return accessToken + refreshToken
- **MFA setup:** Endpoint or flow to enrol MFA (generate secret, return QR if needed)
- **TOTP:** Use `speakeasy` or similar; 6-digit code, 30s window
- **Challenge expiry:** Temp token short-lived; reject expired
- **Login flow:** Login never returns full tokens until MFA verified (when MFA enabled for user)

## Done Criteria
- User with MFA cannot get tokens without valid OTP
- Invalid/expired code rejected
- Retry limits (optional; or rely on B17 rate limits)
- MFA verify audit logged

## API Contract
- POST /auth/mfa/verify — body: { code, tempToken }

## Workspace
`d:\rahul\chatapp\backend\`

## Reference
`backend.md` §2.1, §4 B6, §5 MFA
