# F1: Bootstrap App Shell

**Open a new chat and paste this prompt. Implement only this subtask.**

**Role:** You are my frontend developer.

## Task
Bootstrap the Antigravity chat frontend app shell. This is the first subtask; there are no dependencies.

**Constraint:** Implement strictly in JavaScript. Use `.js` and `.jsx` files only — no TypeScript (`.ts`, `.tsx`).

## Output
- React app (Vite + React + **JavaScript only** — no TypeScript) with:
  - React Router with route placeholders
  - Basic state setup (e.g. React Context or similar)
  - Environment config (e.g. `.env` for API base URL)

## Done Criteria
- `npm run dev` runs successfully
- Route placeholders exist for: `/login`, `/register`, `/mfa`, `/chat`, `/admin/audit-logs`
- App renders and navigates between placeholder routes

## Workspace
Project root: `d:\rahul\chatapp`. Create `frontend/` folder for the React app.

## Stack
React + **JavaScript** (strictly no TypeScript) + Vite. Use `npm create vite@latest frontend -- --template react` if no frontend exists yet. Do not use `react-ts`.

## Reference
See `frontend.md` and `antigravity-ide-prompt.md` in the project root for full spec.
