# B4: Redis Integration

**Open a new chat and paste this prompt. Implement only this subtask.**

## Task
Implement Redis client and helper layer. Presence and rate-limit helpers must be functional. Depends on B1.

## Prerequisites (from B1)
- Backend bootstrap complete
- Config module (B2) for REDIS_URL if available

## Output
- **Redis client:** Connected client; graceful disconnect
- **Presence helper:** Store/retrieve user presence (online/away) by user ID; TTL-based expiry
- **Rate-limit helper:** Check/increment counters by key (e.g. IP, user ID); support per-endpoint limits
- **Usage:** Helpers callable from middleware and socket handlers

## Done Criteria
- Redis connection works
- Presence data can be set and read
- Rate-limit check blocks after threshold
- Helpers exported for use in B5, B9, B15

## Workspace
`d:\rahul\chatapp\backend\`

## Reference
`backend.md` §4 B4, §5 Abuse resistance
