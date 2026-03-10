# B10: Message Safety Pipeline

**Open a new chat and paste this prompt. Implement only this subtask.**

## Task
Implement validation, sanitization, and anti-abuse for messages. XSS/script payloads must be blocked or sanitized. Depends on B9.

## Prerequisites (from B9)
- Message API sends and persists messages
- Message model stores content

## Output
- **Validation:** Max length; reject oversized payloads; reject invalid format
- **Sanitization:** HTML/script removal; allowlist tags if rich text; strip `onerror`, `onclick`, etc.
- **Disallowed patterns:** Block known XSS/script payloads
- **Rate limit:** Per user and per channel (use Redis B4); reject when exceeded
- **Response:** 400 with clear reason for blocked content or rate limit

## Done Criteria
- `<script>alert(1)</script>` does not persist as executable
- Event handlers stripped
- Oversized messages rejected
- Rate limit enforced; 429 or 400 with message

## Security
- Inbound content validated and sanitized server-side
- Persist and return only sanitized representation
- Rate limit message send per user/channel

## Workspace
`d:\rahul\chatapp\backend\`

## Reference
`backend.md` §2.2, §4 B10, §5 Abuse resistance
