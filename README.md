# Pulse Chat

Pulse Chat is a production-oriented, real-time chat application built with React, Express, Socket.io, MongoDB, JWT, and Docker.

## Architecture

- `client/`: Vite, React, TypeScript, and Tailwind responsive web application.
- `server/`: Express API, MongoDB models, JWT auth, Socket.io gateway, validated image uploads.
- MongoDB stores users, direct/group conversations, messages, and read receipts.
- Socket.io delivers messages, presence, typing state, and seen receipts in real time.

## Included capabilities

- Register, sign in, persistent JWT sessions, and protected API routes.
- Direct conversations and group creation.
- Realtime text/image messages with optimistic delivery feedback.
- Presence indicators, typing indicators, unread counts, and seen receipts.
- JPEG, PNG, GIF, and WebP uploads with MIME and file-signature validation.
- Responsive dark-mode interface, test coverage for client utilities and server security helpers.

## Local development

1. Copy `server/.env.example` to `server/.env` and set a unique JWT secret of at least 32 characters.
2. Run `npm install`.
3. Start MongoDB locally, then run `npm run dev`.
4. Open `http://localhost:5173`.

The API is available at `http://localhost:4000`, with `GET /health` for a health check.

## Validation

- `npm run build` type-checks and builds both applications.
- `npm run lint` runs static checks.
- `npm test` runs unit tests.

## Docker

Set a strong `JWT_SECRET` in your environment, then run `docker compose up --build`. The web client is served at `http://localhost:8080`; the API is exposed on port 4000. Uploads and MongoDB data use named Docker volumes.

## Security notes

Passwords are bcrypt-hashed. Auth is JWT-based, routes and socket connections validate tokens, inputs use Zod, errors avoid leaking production internals, requests are rate limited, security headers are enabled, and uploads are size-, MIME-, and signature-checked. Use HTTPS and a managed MongoDB deployment in production.
