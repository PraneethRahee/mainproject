# F3: Auth UI (Login/Register)

**Open a new chat and paste this prompt. Implement only this subtask.**

## Task
Implement Auth UI: login and register forms with client-side validation. Depends on F1.

## Prerequisites (from F1)
- `frontend/` exists with React Router
- Routes: `/login`, `/register` (placeholders)

## Output
- **Login form:** email, password; validation; submit handler (call `POST /auth/login` when backend ready; for now mock or log)
- **Register form:** email, password, confirm password, optional name; validation; submit handler (`POST /auth/register`)
- **Error states:** show validation errors (empty fields, invalid email, password mismatch, weak password)
- **Success/error feedback:** display API error messages when provided

## Done Criteria
- Forms validate before submit
- Error states display clearly
- Successful submission shows appropriate feedback (or redirects to next step)
- No mixing with MFA or session logic — forms only

## API Contract (consume when backend ready)
- `POST /auth/login` — body: `{ email, password }`
- `POST /auth/register` — body: `{ email, password, name? }`

## Workspace
`d:\rahul\chatapp\frontend\`

## Reference
`frontend.md`, `antigravity-ide-prompt.md`
