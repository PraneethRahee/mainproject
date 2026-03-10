# F7: Workspace Frame

**Open a new chat and paste this prompt. Implement only this subtask.**

## Task
Build the workspace frame: sidebar, header, thread area, composer layout. Responsive for desktop and mobile. Depends on F2.

## Prerequisites (from F2)
- Design system with tokens, typography (Space Grotesk, Manrope), base components
- Theme applied

## Output
- **Desktop layout:** 3-column structure:
  - Column 1: Workspace nav (logo, workspace switcher placeholder)
  - Column 2: Channel/DM list placeholder (empty or mock list)
  - Column 3: Conversation pane (header + thread area + composer)
- **Mobile layout:** Stacked; drawer/sheet for channel list; bottom composer
- **Header:** Channel/conversation title placeholder
- **Composer:** Text input placeholder; no send logic yet

## Done Criteria
- 3-column layout on desktop; stacked on mobile
- Drawer navigation works on mobile
- Composer visible at bottom
- Layout uses design tokens; responsive breakpoints

## UI Direction
- Soft gradients, glass surfaces, rounded cards
- Typography: Space Grotesk, Manrope
- Rounded cards, structured spacing

## Workspace
`d:\rahul\chatapp\frontend\`

## Reference
`frontend.md` §3 Layout, `antigravity-ide-prompt.md`
