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

All listed environment variables except `ANTHROPIC_API_KEY`, `PAYAZA_TRANSACTION_PIN`, and `PAYAZA_ACCOUNT_REFERENCE` are required at API startup. `WHATSAPP_API_VERSION`, `PAYAZA_TENANT_ID`, `ESCROW_FEE_PERCENT`, and `LICENSE_FEE_KOBO` default to `v25.0`, `test`, `2.5`, and `50000` respectively. Session and license signing keys must each be at least 32 characters. Never commit `.env` or share test credentials.

After each phase is implemented and tested, commit the phase locally with a clear message such as `Phase 3: WhatsApp channel`. Never commit `.env` or secrets, and do not push unless explicitly requested.

## Webhook tunnel

Meta and Payaza must reach the local API over HTTPS. Start a tunnel such as Cloudflare Tunnel or ngrok and set `PUBLIC_BASE_URL` to its HTTPS origin. Register the WhatsApp callback URL as `https://<your-tunnel-host>/webhooks/whatsapp` and use the configured `WHATSAPP_VERIFY_TOKEN` for verification. Configure Payaza's test collection webhook URL as `https://<your-tunnel-host>/webhooks/payaza`; the backend validates `x-payaza-signature` with `PAYAZA_SECRET_KEY_TEST`.

## Current scope

Phases 0 through 5 provide the service scaffold, database and auth, WhatsApp conversation flow, deal drafting, and buyer entry. Phase 6 creates a fixed-amount Payaza payment link when a buyer accepts; signed collection events are reconciled against Payaza's payment-link transaction API before escrow is marked funded. Phase 7 supports seller delivery with `DELIVER <code> <note>`, buyer approval with `RELEASE DEAL-<code>`, or issue reporting with `ISSUE DEAL-<code>`. Release atomically moves escrow to the fee and seller payable ledger accounts and creates a durable payout. Sellers can register payout details with `PAYOUT <bank-code> <10-digit-account> <account-name> | <sender-address>`, confirm them with `CONFIRM PAYOUT`, and check `PAYOUT STATUS`. Unaccepted deals expire after 72 hours. Phase 8 issues a PDF license certificate after release, sends it to both parties over WhatsApp, and publishes a QR-linked verification record at `/licenses/<certificate-number>/verify`. Certificates are stored in ignored `backend/storage/licenses/`. Apply migrations before exercising these flows against a database.

The Phase 7 release path does not submit real transfers. The Payaza NUBAN request adapter is constrained to the test tenant and is covered with injected responses. A real payout requires a configured test `PAYAZA_TRANSACTION_PIN` and `PAYAZA_ACCOUNT_REFERENCE`; both are optional at startup and must remain local secrets.