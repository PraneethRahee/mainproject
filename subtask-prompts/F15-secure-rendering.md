# F15: Secure Rendering Hardening

**Open a new chat and paste this prompt. Implement only this subtask.**

## Task
Harden message and link rendering to be XSS-safe. Script payloads must not execute. Depends on F9.

## Prerequisites (from F9)
- Message thread renders message content
- Links may appear in messages (backend sanitizes but client must not re-introduce risk)

## Output
- **Message content:** Render only as plain text or use a sanitization library (e.g. DOMPurify) if rich text is needed — per spec, render backend-sanitized content only; never `dangerouslySetInnerHTML` with unsanitized input
- **Links:** All `<a>` tags: `target="_blank" rel="noopener noreferrer"`
- **URL validation:** If parsing URLs from text, validate before making clickable; use safe URL scheme (http, https)
- **Test:** Ensure `<script>alert(1)</script>` and `<img src=x onerror=alert(1)>` do not execute when in message content
- **Attachment links:** Only for `scanned_clean` files; same safe link rules

## Done Criteria
- No `dangerouslySetInnerHTML` with user/backend content
- All links have `rel="noopener noreferrer"`
- Script and event-handler payloads do not execute
- Backend-sanitized HTML (if any) only rendered if safe; prefer plain text

## Security Rules (from spec)
- Render only backend-sanitized message content
- Never use unsanitized dangerouslySetInnerHTML
- Links: noopener, noreferrer

## Workspace
`d:\rahul\chatapp\frontend\`

## Reference
`frontend.md` §2.2, `antigravity-ide-prompt.md`
