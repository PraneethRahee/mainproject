# B3: Mongo Models and Indexes

**Open a new chat and paste this prompt. Implement only this subtask.**

## Task
Create MongoDB schemas and indexes for core entities. CRUD smoke must work on all core entities. Depends on B1.

## Prerequisites (from B1)
- Backend bootstrap complete
- MongoDB connection (or mock for local dev)

## Output
- **Schemas:** User, Session, Channel, ChannelMember, Message, FileAsset, AuditLog
- **User:** identity, role, MFA secret/status, profile data
- **Session:** refresh token hash, device info, expiry, revocation state
- **Channel:** type (group/private/dm), metadata, creator
- **ChannelMember:** channel-user mapping, permission flags
- **Message:** channel, sender, sanitized content, attachment refs, delivery/read info
- **FileAsset:** owner, storage key, hash, MIME/ext/signature metadata, scan status
- **AuditLog:** actor, action, target, result, timestamp, metadata/IP/device
- **Indexes:** For common queries (e.g. channels by user, messages by channel, sessions by user)

## Done Criteria
- All models defined with Mongoose (or equivalent)
- Indexes created
- CRUD smoke works (create, read, update, delete) for each entity

## Roles
`admin`, `member`, `guest`

## Workspace
`d:\rahul\chatapp\backend\`

## Reference
`backend.md` §3 Data Model, §4 B3
