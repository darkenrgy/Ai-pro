# AI-PRO Frontend

This is the React + TypeScript app for the AI-PRO secure communication platform. It handles login, protected routes, chat, and the session flows used by the backend.

## Setup

```bash
cd frontend
npm install
npm run dev
```

Application will run on `http://localhost:5173`

For LAN access from other devices, Vite binds to `0.0.0.0`. If you want HTTPS on the network, place a cert/key pair in `frontend/dev-server-cert.pem` and `frontend/dev-server-key.pem` that includes the machine IP or hostname in its SAN. If those files are not present, the dev server falls back to the existing `localhost+1` certificate when available.

Then open the app from another device with the host machine IP, for example `https://172.30.32.1:5173`.

## Features

- ✅ JWT authentication with secure token storage
- ✅ Role-based access control (RBAC)
- ✅ Protected routes for authenticated users
- ✅ Real-time chat with WebSocket
- ✅ Session creation and management
- ✅ Clean, minimal UI with privacy focus
- ✅ Responsive design for mobile and desktop

## Pages

### Login (`/login`)
- Email and password authentication
- Secure token storage in localStorage
- Role information from backend

### Dashboard (`/dashboard`)
- Welcome message
- Create new session (HOST role)
- Join existing session (PARTICIPANT role)
- Feature overview

### Chat (`/session/:sessionId`)
- Real-time messaging via WebSocket
- Message history
- Connection status indicator
- Participant information

### Join Session (`/join-session`)
- Enter session ID to join
- Optional parent node ID for hierarchy
- Redirect to chat on success

## API Integration

All API calls through `src/api/`:
- `client.ts` - Axios instance with interceptors
- `auth.ts` - Authentication endpoints
- `session.ts` - Session management
- `chat.ts` - WebSocket configuration

## Environment

Application communicates with backend at:
- REST APIs: `http://localhost:8080/api/v1`
- WebSocket: `ws://localhost:8080/ws/chat`

(Proxy configured in `vite.config.ts`)

## Security

- JWT tokens stored in localStorage
- Bearer token auto-injected in all API requests
- 401 responses trigger logout and redirect to login
- Protected routes check authentication and roles
