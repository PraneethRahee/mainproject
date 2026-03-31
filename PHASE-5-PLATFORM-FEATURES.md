# Phase 5: Platform Features (WhatsApp-like Scale Layer)

## Goal
Build platform-level capabilities:
- Push notifications (reliable offline)
- Voice/video calls
- Status/Stories
- Native mobile app readiness

## Scope
- Infra-heavy capabilities with dedicated deployment planning.

## Out of Scope
- Small UI polish
- Minor message tweaks

## Implementation Order
1. Push notification pipeline
2. Call signaling and media infra
3. Status/Stories
4. Mobile app integration quality pass

## Detailed Tasks

### 1) Push Notifications
- Backend:
  - Notification event queue
  - Device token registration/refresh
  - User preference filtering
- Clients:
  - Web push subscription
  - Mobile push handling (if native app exists)

### 2) Voice/Video Calls
- Build signaling service (Socket-based).
- Integrate WebRTC and TURN/STUN.
- Add call UI states:
  - ringing
  - connecting
  - in-call
  - missed/ended
- Add call logs.

### 3) Status/Stories
- Backend:
  - Ephemeral story objects with expiry.
  - Privacy audience controls.
- Frontend:
  - Story tray and viewer.
  - View receipts and posting flow.

### 4) Mobile Readiness
- Native app plans or React Native bridge.
- Background handling for notifications/calls.
- Session and key management parity with web.

## Infra Checklist
- TURN servers configured and monitored.
- Queue/retry strategy for notification events.
- Rate limits and abuse protections for call/story endpoints.
- Observability for message/call delivery KPIs.

## Test Plan
- Offline delivery simulation for push.
- 1:1 and group call stability under weak network.
- Story expiry and privacy visibility checks.
- Load tests for signaling and push throughput.

## Done Criteria
- Push and calls are production-stable.
- Failure and retry paths are observable.
- Mobile and web behavior remains consistent.

## Mistake Prevention Rules
- Do not ship calls without TURN fallback.
- Do not send pushes without mute/privacy filtering.
- Keep rollout behind feature flags with staged release.
