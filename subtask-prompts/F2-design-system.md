# F2: Design System Foundation

**Open a new chat and paste this prompt. Implement only this subtask.**

## Task
Build the design system foundation for the Antigravity chat frontend. Depends on F1 being complete.

## Prerequisites (from F1)
- `frontend/` folder exists with Vite + React app
- App runs with `npm run dev`
- React Router with route placeholders

## Output
- **Design tokens:** CSS variables for color, typography, spacing, motion (in a theme file or CSS)
- **Typography:** Space Grotesk (headings), Manrope (body) — import from Google Fonts
- **Base components:** Button, Input, Card — reusable, styled with tokens
- Shared theme consumed by components

## Done Criteria
- Tokens cover: colors, font sizes, spacing scale, border-radius, transitions
- Base Button and Input components render correctly
- Theme applied globally; components use tokens

## UI Direction (from spec)
- Soft gradients, subtle glass surfaces, calm contrast
- Rounded cards, structured spacing
- Motion: spring/ease, shimmer, micro-interactions; respect `prefers-reduced-motion`

## Workspace
`d:\rahul\chatapp\frontend\`

## Reference
`frontend.md` §3 UI Direction, `antigravity-ide-prompt.md`
