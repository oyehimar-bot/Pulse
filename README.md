# Pulse

Pulse is a WhatsApp escrow and digital licensing demo. The repository keeps the API service and web client separate; the existing HTML files at the repository root are design prototypes.

## Requirements

- Node.js 22 or newer
- PostgreSQL 14 or newer
- npm 10 or newer
- Test credentials for Meta WhatsApp Cloud API and Payaza

## Setup

1. Copy `.env.example` to `.env` and fill in the required values. Keep `.env` local. `VITE_API_BASE_URL` is used by Vite and defaults to `http://localhost:3000` when unset.
2. Create a PostgreSQL database and set `DATABASE_URL` to its connection URL.
3. Install dependencies with `npm install`.
4. Generate the Prisma client and apply the schema with `npm run db:generate` and `npm run db:migrate`.
5. Load local sample rows with `npm run db:seed`.
6. Start the API and frontend with `npm run dev`.

Run focused backend tests with `npm test`.

To run the database-backed auth integration test, set `TEST_DATABASE_URL` to an isolated PostgreSQL test database and run `npm test`. Do not point it at production data. The test creates and deletes test accounts.

The API listens on `http://localhost:3000` by default and the Vite client on `http://localhost:5173`. The API's liveness endpoint is `GET /health`.

All listed environment variables except `ANTHROPIC_API_KEY` are required at API startup. `WHATSAPP_API_VERSION`, `PAYAZA_TENANT_ID`, `ESCROW_FEE_PERCENT`, and `LICENSE_FEE_KOBO` default to `v25.0`, `test`, `2.5`, and `50000` respectively. Session and license signing keys must each be at least 32 characters. Never commit `.env` or share test credentials.

After each phase is implemented and tested, commit the phase locally with a clear message such as `Phase 3: WhatsApp channel`. Never commit `.env` or secrets, and do not push unless explicitly requested.

## Webhook tunnel

Meta must reach the local API over HTTPS. Start a tunnel such as Cloudflare Tunnel or ngrok and set `PUBLIC_BASE_URL` to its HTTPS origin. Register the WhatsApp webhook callback URL as `https://<your-tunnel-host>/webhooks/whatsapp` and use the configured `WHATSAPP_VERIFY_TOKEN` for verification. The webhook route is added in Phase 3; until then, the URL is not yet served.

## Current scope

Phase 0 provides the service and client scaffold. Phase 1 adds the PostgreSQL schema and seed data. Phase 2 adds `POST /auth/challenges`, `GET /auth/challenges/:challengeId`, `GET /auth/me`, and `POST /auth/logout`. Challenge creation returns a six-digit code for the user to send to Pulse, and status polling establishes an HTTP-only cookie session after the WhatsApp proof is accepted.

The proof consumer is implemented in the backend for the Phase 3 Meta webhook to call after signature verification. Until Phase 3 is built and configured with Meta test credentials, the WhatsApp code round trip is not connected. There are no mock webhook endpoints or fake WhatsApp messages.