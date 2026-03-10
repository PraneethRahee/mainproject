# F4: MFA Verify Screen

**Open a new chat and paste this prompt. Implement only this subtask.**

## Task
Implement the MFA step-up UI. Login flow must complete only after MFA success. Depends on F3.

## Prerequisites (from F3)
- Login form exists and submits to `POST /auth/login`
- Backend returns MFA-required state (e.g. `{ requiresMfa: true, tempToken? }`) when credentials valid

## Output
- **MFA verify screen:** OTP/TOTP code input (6 digits typical)
- **Flow:** Login success with `requiresMfa` → redirect to `/mfa` with temp token in state/query → user enters code → `POST /auth/mfa/verify` → on success, receive access + refresh tokens
- **Error states:** invalid code, expired challenge
- **Resend option:** if backend supports it

## Done Criteria
- User cannot reach chat without completing MFA after login
- MFA screen shows after successful credential check when MFA required
- Invalid code shows error; valid code completes auth and stores tokens

## API Contract
- `POST /auth/mfa/verify` — body: `{ code, tempToken? }` — returns `{ accessToken, refreshToken }`

## Workspace
`d:\rahul\chatapp\frontend\`

## Reference
`frontend.md`, `antigravity-ide-prompt.md`
