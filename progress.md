# Pulse Build Progress

Updated: 2026-10-10

## Current checkpoint

Phases 0 through 9 are implemented and verified locally. Phase 6 uses Payaza's test payment-link API and signed webhook contract. Phase 7 implements delivery, buyer release or issue reporting, escrow/fee/payout accounting, payout status reconciliation, and deal expiry. Phase 8 issues a canonical-data-hashed PDF certificate after release and exposes public verification. Phase 9 adds a session-protected React workspace and typed read APIs. The release path intentionally does not submit a Payaza transfer in this credential-incomplete mock-only run.

The frontend redesign work (Task 2) and the full local smoke test (Task 3) are still pending. Task 1, the frontend/backend connection fix, is complete and committed.

## Built so far

### Phase 0: Scaffold

- Added npm workspaces with separate `backend/` and `frontend/` projects.
- Added the Fastify TypeScript API, CORS and security-header plugins, and `GET /health`.
- Added Zod-based startup validation for the configured environment variables, including clear per-variable validation messages and minimum lengths for signing secrets.
- Added the React, Vite, and TypeScript frontend shell. It fetches the API health endpoint and displays the connection state.
- Added root `.env.example`, and `.env` is excluded by `.gitignore`.
- Added workspace scripts for development, build, typecheck, lint, Prisma generation, migration, and seed.
- Added a README with setup instructions, service URLs, and a tunnel note for the future WhatsApp webhook.

### Phase 1: Database

- Added Prisma models for users, sessions, deals, deal events, ledger entries, payments, webhook events, messages, and licenses.
- Added the requested deal/payment/webhook/message enums, relations, indexes, and uniqueness constraints, including unique external webhook IDs and WhatsApp message IDs.
- Added an initial schema migration and a SQL migration with international phone and positive-kobo checks plus a PostgreSQL trigger that rejects ledger updates and deletes.
- Added a single `transitionDeal` service that validates allowed state transitions, performs a compare-and-set update, and appends a transition audit event.
- Added ledger append and account-balance helpers. Balances are derived from signed append-only entries.
- Added an idempotent seed script for a demo seller, buyer, and draft deal.

### Phase 2: Auth with WhatsApp proof

- Added persisted, short-lived auth challenges with six-digit codes stored only as keyed hashes.
- Added request limits of three challenges per phone and ten per requester IP per 15-minute window, plus a five-wrong-code lockout per challenge.
- Added endpoints to request a challenge, poll proof status, read the current cookie session, and log out.
- Added proof consumption for an international sender phone. It verifies an existing account in place or creates a phone-verified account after successful proof.
- Added a seven-day random session token stored only as a SHA-256 hash in PostgreSQL and returned only in an HTTP-only cookie.
- Added the signup/login wireframe flow with WhatsApp link, displayed code, polling, expiry/lockout feedback, account state, and logout.
- Exported the proof consumer for Phase 3's signature-verified Meta webhook. No fake incoming-message route was added.

### Phase 6: Payaza test payments

- Create and persist a fixed-amount Payaza payment link after buyer acceptance, then deliver the hosted checkout URL to the buyer over WhatsApp.
- Verify Payaza webhook HMAC-SHA512 signatures against the exact raw request body and deduplicate by transaction reference and status.
- Reconcile signed transaction references through Payaza's documented payment-link transaction lookup rather than assuming an undocumented deal-reference field.
- Verify the completed transaction amount, then atomically mark the payment successful, transition the deal to `FUNDED`, record the escrow ledger credit, and complete the webhook event.
- Notify both buyer and seller after escrow funding. Persist each payment link ID for transaction reconciliation.

### Phase 7: Delivery and release

- Sellers submit a delivery note for funded deals; the deal transitions to `DELIVERED` with a separate delivery audit event and buyer notification.
- Buyers can release a delivered deal or report an issue. Issues move the deal to `DISPUTED` and leave escrow untouched.
- Buyer release atomically transitions to `RELEASED`, debits escrow, credits the configured fee and seller payable, and creates one durable `READY` payout.
- Sellers can securely confirm bank payout details through WhatsApp; `PAYOUT STATUS` lists the latest ten payouts.
- Signed Payaza payout events update payout state; seller payable is debited only once after `NIP_SUCCESS`, while failure leaves proceeds payable.
- Unaccepted buyer-entry deals expire after 72 hours through an audited background worker.
- The documented Payaza NUBAN request builder is test-tenant-only and contract-tested. No payout HTTP request is made by the Phase 7 release route in this local mock-only run.

### Phase 8: License certificate

- After buyer release, create one idempotent license certificate per deal from an immutable canonical snapshot of the deal, parties, rights, value, and issuance time.
- Compute a deterministic SHA-256 over recursively key-sorted canonical JSON and persist both the snapshot and hash.
- Render an A4 PDF with the certificate number, parties, work, rights, deal value, integrity hash, and QR verification URL. Store it under ignored `backend/storage/licenses/` with private file permissions and atomic rename.
- Send the PDF and verification URL to both buyer and seller using the existing WhatsApp document sender.
- Public `GET /licenses/:certificateNumber/verify` rehashes the stored snapshot; `GET /licenses/:certificateNumber.pdf` serves the certificate only when the snapshot hash is valid.

### Phase 9: React workspace

- Replace the auth-only frontend shell with an operational overview, searchable deal register, deal detail panel, certificate list, and public certificate verification page.
- Preserve WhatsApp proof signup/login and session logout as the workspace entry flow.
- Add session-protected `GET /api/dashboard`, `GET /api/deals/:dealCode`, and `GET /api/licenses` endpoints scoped to the signed-in buyer/seller.
- Return typed, money-safe DTOs with kobo values represented as decimal strings; keep payout bank details and provider raw payloads out of dashboard responses.
- Show per-deal timeline, ledger, payment/payout state, linked messages, and certificate verification/PDF links.

### Task 1: Frontend/backend connection fix (2026-10-10)

- Root cause 1: `VITE_API_BASE_URL` in the root `.env` pointed at `http://localhost:5173`, the Vite dev server itself, so `POST /auth/challenges` hit the frontend and returned 404. It now points at the backend, `http://localhost:3000`.
- Root cause 2: `FRONTEND_URL` had a trailing slash (`http://localhost:5173/`), which does not match the browser `Origin` header. It is now `http://localhost:5173` so the CORS allow-origin comparison succeeds.
- Root cause 3: `PUBLIC_BASE_URL` pointed at the Railway HTTPS origin, which made the session cookie use `SameSite=None; Secure`. That combination is rejected by a plain local HTTP browser. Local dev now uses `http://localhost:3000`, so the cookie falls back to `SameSite=Lax` with no `Secure` flag. The Railway production value is preserved as a comment in `.env` for deployment.
- No code changes were required. `backend/src/app.ts` already derives CORS origin from `FRONTEND_URL` and cookie attributes from the `PUBLIC_BASE_URL` protocol, and `frontend/vite.config.ts` already reads env from the repository root via `envDir: ".."`.
- `.env` remains gitignored, so these values stay local and are documented here instead of committed.

## Verification so far

- Prisma client generation and schema validation passed with matching Prisma CLI/client 6.19.0.
- Workspace typecheck, ESLint, production builds, and the backend test suite passed.
- The backend test suite verifies blank environment defaults, missing required values, and `GET /health` returning 200.
- A live API process started with test-only environment values, and `GET /health` returned `{"status":"ok","service":"pulse-api"}`.
- Both migrations deployed successfully to a disposable PostgreSQL 18 cluster under `/tmp`.
- The seed ran twice and left exactly two users, one demo deal, and one creation event.
- Database checks rejected an update to a ledger entry and rejected a zero-kobo ledger entry.
- The disposable API process and PostgreSQL cluster were stopped and removed after testing.
- `.env` ignore behavior was confirmed with `git check-ignore`.
- An offline npm audit reported zero vulnerabilities. A fresh registry audit could not be obtained because the npm registry was unreachable.
- Phase 2 migration deployed successfully to a fresh disposable PostgreSQL 18 database.
- Database-backed auth tests passed for new signup, existing-account login, wrong sender/code, one-time code consumption, cookie session, logout, expiry, phone/IP throttling, and five-attempt lockout.
- Phase 2 typecheck, ESLint, production builds, schema validation, and all backend tests passed.
- Phase 6 Payaza tests pass for the documented payment-link request, exact raw-body HMAC validation, webhook rejection/acceptance, transaction reconciliation, atomic escrow funding, and buyer/seller notices.
- Phase 6 full backend suite, workspace build, and lint pass. The database-backed auth integration test is skipped unless `TEST_DATABASE_URL` is configured.
- Phase 7 service tests pass for delivery audit, atomic release ledger postings and payout creation, invalid fee rejection, 72-hour expiry transitions, documented NUBAN payload construction, and successful payout settlement reconciliation.
- Phase 8 tests pass for deterministic canonical hashing, snapshot tamper detection, release-only/idempotent issuance, QR-backed PDF generation, public verification, and PDF serving.
- Phase 9 dashboard API tests pass for unauthenticated rejection, scoped dashboard reads, deal-detail monetary serialization, and certificate-link generation.
- Task 1: a fresh disposable PostgreSQL 18 cluster was started on port 55439 under `/tmp` and all seven migrations deployed with `prisma migrate deploy`, matching the configured `DATABASE_URL`.
- Task 1: backend `GET /health` returned `{"status":"ok","service":"pulse-api"}` and the Vite dev server served the app on port 5173.
- Task 1: the served `api.ts` module from Vite injects `VITE_API_BASE_URL` as `http://localhost:3000`, so all API calls target the backend.
- Task 1: `OPTIONS` preflight and `POST /auth/challenges` from origin `http://localhost:5173` both returned `access-control-allow-origin: http://localhost:5173` and `access-control-allow-credentials: true`; the POST returned 201 with a challenge payload.
- Task 1: a real headless Chrome session loaded `http://localhost:5173`, the auth screen rendered with no page console errors, and submitting the form issued `GET /auth/me`, `POST /auth/challenges`, and polling `GET /auth/challenges/:id` all against `http://localhost:3000`. The one-time code and the `wa.me` WhatsApp link rendered correctly, and the polling status showed `PENDING` as expected before a real WhatsApp proof arrives.
- Task 1: the only browser console entries were the expected pre-login `401` from `GET /auth/me` and a cosmetic `favicon.ico` 404 on the Vite dev server. Neither is a connection failure.

## Open Phase 0/1 work

- Confirm the demo user's actual PostgreSQL `DATABASE_URL` and run migrations/seed there when available; current testing was against a disposable database only.
- Add focused automated tests for allowed and rejected deal transitions and ledger balance derivation. Database persistence constraints have been exercised, but those service functions do not yet have dedicated tests.
- Recheck dependency advisories against the npm registry when network access returns. An earlier online audit reported four high findings in Prisma's development CLI dependency tree and suggested Prisma 6.12.0. Registry access failed during the update attempt, so CLI/client remain consistently pinned at 6.19.0.
- Confirm README commands from a fresh clone/install with the project's real PostgreSQL connection details.
- Complete the real WhatsApp proof loop in Phase 3 by passing verified inbound Meta messages to the exported proof consumer. The Phase 2 UI cannot receive a WhatsApp proof until that webhook exists.

## Remaining phases

- **Task 2: Rebuild the frontend visual layer.** Replace the green forest theme in `frontend/src/style.css`, `Workspace.tsx`, and `VerificationPage.tsx` with the midnight and glass design system from the `saved/` reference files, without touching any API calls, state, routing, or types.
- **Task 3: Smoke test the full connection.** Exercise login through a real WhatsApp proof, then confirm the dashboard, deal panel, licenses page, and public verify page all load against the redesigned frontend.
- **Phase 10: Demo hardening.** Written end-to-end demo procedure, request IDs and structured logs, webhook troubleshooting, and fixes for failures found.

## Build workflow rule

- Ensure Git is initialized before implementation if the repository has no `.git` directory.
- After each phase is implemented and tested, make a local commit with a clear phase-specific message, for example `Phase 3: WhatsApp channel`.
- Never commit `.env` or any secret, and never push unless explicitly requested.

## Assumptions and known workspace state

- The API is intended to run on port 3000 and Vite on port 5173 by default.
- Prisma CLI and client are set to 6.19.0 and lockfile installation/generation has been verified. The attempted switch to audit-suggested 6.12.0 could not install because the npm registry was unreachable. Recheck the development dependency audit when registry access is available.
- A workspace sorter moved the pre-existing prototype files from the repository root into `save/`. Those files remain present there. This build did not intentionally edit or delete the prototypes; their relocation appears in Git as deletions at the old paths and an untracked `save/` directory.
- Payaza test credentials are configured locally. Apply the Phase 6 migration with `npm run db:migrate` before running the payment flow against a persistent database.
- Payaza must be configured to send collection webhooks to `/webhooks/payaza` on the public HTTPS API origin. Live payments remain out of scope for Phase 6.
- `PAYAZA_TRANSACTION_PIN` and `PAYAZA_ACCOUNT_REFERENCE` are currently missing from local `.env`; they are optional config and must be supplied locally before a real transfer adapter can be used. Phase 7 release currently only queues `READY` payouts; no transfer was submitted.
- WhatsApp seller payout setup uses `PAYOUT <bank-code> <10-digit-account> <account-name> | <sender-address>`, followed by `CONFIRM PAYOUT`. Sellers can view statuses with `PAYOUT STATUS`; buyers use `RELEASE DEAL-<code>` or `ISSUE DEAL-<code>`, and sellers use `DELIVER <code> <delivery note>`.
- Apply the Phase 8 migration before issuing certificates against a persistent database. Certificate PDFs are stored locally in ignored `backend/storage/licenses/`; production deployment must mount durable storage or replace this path with an object-storage backend.
- Local dev on this machine runs against a disposable PostgreSQL 18 cluster under `/tmp/pulse-pg` on port 55439, started for the Task 1 verification. It is recreated from `prisma migrate deploy` and is not durable; point `DATABASE_URL` at a persistent database before the Task 3 smoke test if seeded demo data should survive.
- Backend and frontend dev servers were left running for the redesign work: backend via `npm run dev --workspace backend` on port 3000, frontend via `npm run dev --workspace frontend` on port 5173.