# B2: Config and Secrets Baseline

**Open a new chat and paste this prompt. Implement only this subtask.**

## Task
Implement env schema and config module. App must fail fast on invalid or missing env. Depends on B1.

## Prerequisites (from B1)
- `backend/` folder with Express + JavaScript + Socket.IO
- App runs and health endpoint works

## Output
- **Env schema:** Validate required vars at startup (e.g. `NODE_ENV`, `PORT`, `MONGODB_URI`, `REDIS_URL`, `JWT_SECRET`, `MFA_SECRET`)
- **Config module:** Single export with typed config; no raw `process.env` scattered in code
- **Fail fast:** App exits with clear error if env invalid or missing

## Done Criteria
- Invalid/missing env causes immediate exit with descriptive error
- Config module used elsewhere for DB URL, secrets, etc.
- No secrets in code; use env only

## Workspace
`d:\rahul\chatapp\backend\`

## Reference
`backend.md` §5 Security, §4 B2
