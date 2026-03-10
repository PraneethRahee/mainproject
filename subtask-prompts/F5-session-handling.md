# F5: Session Handling

**Open a new chat and paste this prompt. Implement only this subtask.**

## Task
Implement access/refresh token flow in the API client. Expired access token must auto-refresh (once) before failing.

## Prerequisites (from F3, F4)
- Auth flow produces `accessToken` and `refreshToken`
- Tokens stored (e.g. memory + localStorage/sessionStorage for refresh)

## Output
- **API client:** Axios/fetch wrapper that:
  - Adds `Authorization: Bearer <accessToken>` to requests
  - On 401: calls `POST /auth/refresh` with refresh token
  - On refresh success: retries failed request with new access token
  - On refresh failure: redirect to login, clear tokens
  - Implements refresh token rotation (use new refresh token from response)
- **Singleton:** One client used app-wide for REST calls

## Done Criteria
- Expired access token triggers single refresh attempt
- Refreshed token used for retried request
- Refresh failure leads to logout and login redirect
- No infinite refresh loops

## API Contract
- `POST /auth/refresh` — body: `{ refreshToken }` — returns `{ accessToken, refreshToken }`

## Workspace
`d:\rahul\chatapp\frontend\`

## Reference
`frontend.md`, `antigravity-ide-prompt.md`
