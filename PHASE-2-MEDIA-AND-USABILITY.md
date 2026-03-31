# Phase 2: Media and Usability

## Goal
Improve messaging quality with media-first UX:
- Voice notes
- Chat media gallery
- Forward message and multi-select actions
- Better reply jump behavior
- Per-chat notification preferences

## Scope
- Voice note send/playback path
- Media/document discovery UI
- Bulk actions UX for messages
- Notification preference model and settings

## Out of Scope
- Group invite links
- Admin policy matrix
- Device/session management
- Calls

## Implementation Order
1. Voice notes end-to-end
2. Media gallery (read-only first)
3. Multi-select + forward flow
4. Reply jump-to-original polish
5. Chat notification settings

## Detailed Tasks

### 1) Voice Notes
- Backend:
  - Reuse secure file upload flow (`POST /files/upload`) and existing `FileAsset` storage.
  - Add/strengthen validated `audio/*` support:
    - Enforce a voice-note-specific max size (and optionally duration-derived limit).
    - Prefer an audio mime allowlist + signature (magic bytes) checks for common formats.
  - Store voice notes as normal message attachments (`attachments: [FileAsset]`):
    - Current message `type` stays `file` and the frontend infers "voice note" via `attachmentDetails.mimeType` starting with `audio/`.
  - Attach metadata (duration required; waveform optional) in `FileAsset` or derived payload.
- Frontend:
  - Add a record button with hold-to-record and tap-to-stop (mobile-friendly).
  - Record using `MediaRecorder` (target `audio/webm` + opus where supported).
  - Preview before send (playback + basic timeline); allow cancel/re-record.
  - Reuse the existing attachment upload pipeline and security scan polling.
  - Allow sending when composer text is empty as long as a ready ( `scanned_clean` ) audio attachment exists.
  - Message-view playback UI for audio attachments:
    - play/pause
    - seek/progress
    - speed controls (1x/1.25x/1.5x or similar)

### 2) Media Gallery
- Backend:
  - Add `GET /messages/:conversationId/media` with pagination/filter type.
- Frontend:
  - Add media tab in chat info.
  - Sections: images, videos, documents, links.
  - Click opens file/message context.

### 3) Forward + Multi-select
- Backend:
  - Endpoint to forward existing message payload safely.
  - Preserve audit log and sender attribution policy.
- Frontend:
  - Multi-select mode.
  - Forward target picker.
  - Confirm action modal.

### 4) Reply Jump-to-Original
- On tapping quoted block:
  - Jump to message if loaded.
  - Attempt lazy-load older pages until found.
  - Highlight target briefly.

### 5) Notification Preferences
- Backend:
  - User-chat preference model (`mutedUntil`, `mute`, `sound` later).
  - Endpoints to set/get preferences.
- Frontend:
  - Settings in chat info panel.
  - Mute toggles and duration presets.

## Test Plan
- Voice note upload/playback on major browsers.
- Voice note send with empty composer text + ready `scanned_clean` audio attachment.
- Gallery pagination and type filters.
- Forwarding preserves text/attachments as expected.
- Multi-select edge cases (cancel, partial failure).
- Notification settings persistence per chat.

## Done Criteria
- Voice notes and gallery fully usable in active chats.
- Forward and multi-select stable.
- No regressions in existing message send flow.

## Mistake Prevention Rules
- Never bypass existing file safety checks.
- Keep media APIs paginated.
- Do not block normal message composer UX while in media flows.
