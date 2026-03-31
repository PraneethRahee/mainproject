## TLS Profile

- **Ingress TLS termination**: Terminate TLS at a reverse proxy or load balancer such as nginx, HAProxy, or a cloud load balancer (e.g. AWS ALB / GCP HTTPS Load Balancer).
- **Node.js**: Run the Node.js backend as HTTP **only** behind the proxy. Do not enable HTTPS directly in the Node process in production.
- **Minimum TLS version**: TLS 1.2 or higher; prefer TLS 1.3 where supported.
- **Cipher suites**:
  - Prefer modern, forward-secret ciphers (ECDHE + AES-GCM or CHACHA20-POLY1305).
  - Disable legacy and insecure ciphers (e.g. RC4, 3DES) and protocols (SSLv3, TLS 1.0, TLS 1.1).
- **Certificates**:
  - Use certificates from a trusted CA (e.g. Let’s Encrypt).
  - Automate renewal and reload via the reverse proxy (e.g. certbot + nginx reload).
- **HSTS**:
  - Configure HTTP Strict Transport Security at the proxy level to enforce HTTPS for the primary domain.
  - Start with a conservative `max-age` in staging before enabling preload in production.
- **Proxy headers**:
  - Ensure the proxy forwards `X-Forwarded-For` and `X-Forwarded-Proto` so the backend can log client IPs correctly.
  - Configure Express `trust proxy` if deployed behind a trusted proxy.

---

## Deploy Runbook

### 1. Prerequisites

- **Runtime**: Node.js 20.x LTS.
- **Databases**:
  - MongoDB instance reachable from the backend.
  - Redis instance for rate limiting and presence.
- **Environment variables** (see `src/config.js`):
  - `NODE_ENV` (`production` in production).
  - `PORT` (default 4000).
  - `MONGODB_URI` (connection string for MongoDB).
  - `REDIS_URL` (connection string for Redis).
  - `JWT_SECRET` (at least 32 chars, high-entropy).
  - `MFA_SECRET` (at least 16 chars, used for MFA flows).
  - `CORS_ORIGINS` (comma-separated list of allowed frontend origins).

### 2. Build and Install

```bash
cd backend
npm install --production
```

There is no separate build step; the backend runs directly from `src/`.

### 3. Database and Indexes

- Ensure MongoDB is reachable using the configured `MONGODB_URI`.
- The Mongoose models define required indexes; they are created automatically on first run.
- Optionally run the smoke test scripts:

```bash
npm run mongo:smoke
npm run redis:smoke
```

### 4. Starting the Service

- **Local / simple process**:

```bash
NODE_ENV=production PORT=4000 node src/index.js
```

- **With a process manager** (recommended for production, e.g. systemd, PM2):
  - Create a unit or PM2 ecosystem config that:
    - Sets required environment variables.
    - Restarts the process on failure.
    - Sends logs to your centralized logging stack.

### 5. Health Check

- HTTP health endpoint:
  - `GET /health` → returns `200` with `{ "status": "ok" }` when the app and DB connection are ready.
- Configure the load balancer or orchestrator (e.g. Kubernetes `readinessProbe`/`livenessProbe`) to use this endpoint.

### 6. Logging and Monitoring

- **Application logs**: Capture stdout/stderr from the Node process and forward to your logging system.
- **Audit logs**: Persisted in MongoDB via the `AuditLog` model; use the `/admin/audit-logs` endpoint for admin review.
- **Metrics** (optional): Integrate a metrics collector (e.g. Prometheus exporter) around key operations (auth, message send, uploads).

### 7. Zero-Downtime Deployment (Recommended Pattern)

1. Deploy the new container or VM alongside the existing version.
2. Run database migrations or index checks if needed.
3. Run the automated **test suite** (see below) against the new deployment.
4. Switch traffic via the load balancer to the new instances.
5. Monitor logs and health checks; roll back quickly if issues appear.

---

## Test Suite Overview

The recommended tests are grouped by feature area. Implement them using your preferred test runner (e.g. Jest, Mocha) and HTTP/WebSocket client libraries.

### 1. Auth Tests

- **Register**:
  - `POST /auth/register` with valid email+password → `201`.
  - Duplicate email → `409`.
- **Login**:
  - Valid credentials → `200` with `accessToken` + `refreshToken` (when MFA disabled).
  - Invalid credentials → `401`.
  - Rate limiting enforced after repeated attempts from the same IP.
- **MFA**:
  - `POST /auth/mfa/setup` with valid access token → returns secret and otpauth URL.
  - `POST /auth/mfa/verify` with correct TOTP → returns tokens.
  - Incorrect TOTP multiple times → `401` and rate limiting applied.
- **Refresh**:
  - `POST /auth/refresh` with valid refresh token → new access+refresh tokens.
  - Reusing an old refresh token after rotation → `401` and associated token family revoked.
- **Logout**:
  - `POST /auth/logout` invalidates refresh session; subsequent refresh attempts fail.

### 2. RBAC Tests

- Non-admin user:
  - `GET /admin/audit-logs` → `403` (guarded by `AdminRoute` and backend RBAC).
- Guest or non-member:
  - Attempt to join protected/private channels or access messages they should not see → `403`.

### 3. Message Safety Tests

- Send messages containing:
  - `<script>alert(1)</script>`
  - `<img src=x onerror=alert(1)>`
  - Inline `javascript:` URLs.
- Verify:
  - API returns sanitized content.
  - Stored messages do not contain executable script tags.
  - Frontend rendering shows inert text; no script execution.

### 4. Upload and File Safety Tests

- **Allowed types**:
  - Upload image, video, PDF, Office document, and archive via `POST /files/upload`.
  - Expect `201` with file ID and `FileAsset.scanStatus` transitions from `quarantined` to `scanned_clean` (stubbed scanner).
- **Blocked types**:
  - Upload `.exe`, `.dll`, `.bat`, `.cmd`, `.ps1`, `.sh`, `.js`, `.msi`, `.apk`.
  - Expect `400` with clear reason (e.g. “Disallowed file type: .exe”); no `FileAsset` record persisted.
- **Validation**:
  - Oversized file (>50MB) → `400`.
  - MIME/magic-byte mismatch → `400`.
- **Access**:
  - `GET /files/:id/status` returns scan status.
  - `GET /files/:id/download`:
    - `scanned_clean` → streams file.
    - `uploaded`/`quarantined`/`scanned_blocked` → `403`.

### 5. Socket Tests

- **Connection and auth**:
  - Connect Socket.IO client, emit `auth:resume` with valid token → server acknowledges.
  - Invalid or expired token → server rejects and prevents channel actions.
- **Channel join/leave**:
  - `channel:join`/`channel:leave` only succeed for authenticated users with channel membership.
- **Messaging**:
  - `message:send` from one client appears as `message:new` on all sockets joined to the channel.
- **Typing and presence**:
  - `typing:start` / `typing:stop` produce `typing:update`.
  - `presence:ping` updates Redis and broadcasts `presence:update`.
- **Reconnect**:
  - After disconnect and reconnect, client re-emits `auth:resume` and rejoins the active channel; new messages continue to flow.

### 6. Audit Logging Tests

- **Auth events**:
  - Register, login, MFA verify, refresh, and logout all create `AuditLog` entries with appropriate `action`, `actor`, `result`, and metadata.
- **Chat and channels**:
  - Channel create/join/leave and message send (REST and socket) create audit records.
- **File operations**:
  - Successful upload/download and validation failures write `file.upload` / `file.download` entries with relevant metadata.
- **Admin views**:
  - `GET /admin/audit-logs` as admin creates `admin.audit_logs.view` entries.

These tests should be wired into your CI pipeline (e.g. `npm test`) and run against staging and production-like environments before each deployment.

