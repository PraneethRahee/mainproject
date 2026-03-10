# F17: UI Polish + Tests

**Open a new chat and paste this prompt. Implement only this subtask.**

## Task
Final polish: motion/accessibility pass and test suite. Critical flows must pass unit/integration/e2e smoke. Depends on F1–F16.

## Prerequisites
- All previous subtasks F1–F16 implemented
- App runs end-to-end: login → MFA → chat → send message → etc.

## Output
- **Motion/accessibility pass:**
  - Staggered list animations for message timeline and channel list
  - Spring/ease transitions for drawers, modals
  - `prefers-reduced-motion` respected — reduce or disable animations when set
  - Focus management: keyboard nav, focus trap in modals
  - ARIA labels where needed
- **Test suite:**
  - Unit tests: auth helpers, API client, secure link renderer
  - Integration: login flow, message send, channel switch
  - E2E smoke: critical path (login → MFA → send message)
- **Polish:** Loading skeletons, toast notifications, micro-interactions

## Done Criteria
- Critical flows pass tests
- Reduced motion respected
- Keyboard navigation works
- No regressions in existing features
- QA checklist items pass: auth/MFA, session refresh, XSS, uploads, socket reconnect, mobile layout

## QA Checklist (verify)
- Auth and MFA happy and failure paths
- Session refresh and forced logout
- XSS payload tests in message content
- Upload tests: image, video, pdf, doc, archive, blocked executable
- Socket reconnect/resume
- Mobile layout: navigation, thread, composer, file upload

## Workspace
`d:\rahul\chatapp\frontend\`

## Reference
`frontend.md` §6 QA Checklist, `antigravity-ide-prompt.md`
