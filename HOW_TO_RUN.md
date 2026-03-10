## How to Run Antigravity Chat (Local)

### 1. Prerequisites

- **Node.js**: v18+ recommended.
- **MongoDB**: running locally (default `mongodb://localhost:27017` is fine).
- **Redis**: running locally (default `redis://localhost:6379`).
- **Package manager**: `npm` (comes with Node).

### 2. Backend Setup

From the project root (`d:\rahul\chatapp`):

```bash
cd backend
npm install
```

Create `backend/.env`:

```env
NODE_ENV=development
PORT=4000

MONGODB_URI=mongodb://localhost:27017/chatapp
REDIS_URL=redis://localhost:6379

JWT_SECRET=replace_with_32+_char_random_secret
MFA_SECRET=replace_with_16+_char_random_secret
```

Then start the backend:

```bash
cd backend
npm run dev
```

Backend should log:

- `Connected to MongoDB`
- `Connected to Redis`
- `Backend listening on http://localhost:4000`

### 3. Frontend Setup

From the project root:

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:4000
```

Then start the frontend dev server:

```bash
cd frontend
npm run dev
```

Vite will show a local URL, typically:

- `http://localhost:5173/`

Open that URL in your browser.

### 4. Basic Usage Flow

1. **Register a user**
   - Go to `/register` in the frontend.
   - Fill email + password and submit.

2. **Login**
   - Go to `/login`.
   - Enter the same credentials.
   - If MFA is not enabled yet, you’ll be taken to the chat workspace directly.

3. **Enable MFA (optional, for demo)**
   - After logging in (no MFA), copy your `accessToken` from a login API response (via browser dev tools or a REST client).
   - Call:
     - `POST http://localhost:4000/auth/mfa/setup`
     - Body: `{ "accessToken": "<your_access_token>" }`
   - Take the returned `otpauthUrl` or `secret` and add it to Google Authenticator/Authy.
   - Next login with this user will require MFA; use the 6‑digit code from the authenticator app on the `/mfa` screen.

4. **Channels and Messages**
   - After login/MFA, go to `/chat`.
   - The app will:
     - Call `GET /channels` to load your channels.
     - When you click a channel, call `GET /channels/:id/messages` to load messages.
   - Type a message in the composer and press **Enter** to send (Shift+Enter for newline).

### 5. Admin Role Demo (Optional)

To demo admin-only UI and APIs:

1. In MongoDB, locate a user in the `users` collection and change `role` to `"admin"`.
2. Log in as that user.
3. You should see:
   - “Audit Logs” in the top navigation.
   - `/admin/audit-logs` accessible in the frontend (and `GET /admin/audit-logs` usable via API tools).

### 6. Stopping Services

- **Backend**: stop the terminal running `npm run dev` (Ctrl+C).
- **Frontend**: stop the terminal running `npm run dev` (Ctrl+C).
- **MongoDB/Redis**:
  - If running as services, stop via their service managers.
  - If running in Docker, stop the relevant containers.

