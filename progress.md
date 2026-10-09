# Pulse Build Progress

Updated: 2026-10-09

## Current checkpoint

Phase 0, Phase 1, and the Phase 2 auth implementation are complete and locally verified. Phases 3 through 10 have not started. No Meta WhatsApp or Payaza integration has been attempted, and no external calls are mocked.

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

## Open Phase 0/1 work

- Confirm the demo user's actual PostgreSQL `DATABASE_URL` and run migrations/seed there when available; current testing was against a disposable database only.
- Add focused automated tests for allowed and rejected deal transitions and ledger balance derivation. Database persistence constraints have been exercised, but those service functions do not yet have dedicated tests.
- Recheck dependency advisories against the npm registry when network access returns. An earlier online audit reported four high findings in Prisma's development CLI dependency tree and suggested Prisma 6.12.0. Registry access failed during the update attempt, so CLI/client remain consistently pinned at 6.19.0.
- Confirm README commands from a fresh clone/install with the project's real PostgreSQL connection details.
- Complete the real WhatsApp proof loop in Phase 3 by passing verified inbound Meta messages to the exported proof consumer. The Phase 2 UI cannot receive a WhatsApp proof until that webhook exists.

## Remaining phases

- **Phase 3: WhatsApp channel.** Meta verification and signature checking, webhook deduplication and quick acknowledgement, background processing, message send types, inbound routing, and surfaced delivery failures.
- **Phase 4: Deal drafting.** Structured Anthropic parsing when configured, exact-format fallback, editable draft confirmation, and optional buyer verification phrase.
- **Phase 5: Buyer entry.** Confirmed deal creation, unique deal code and `wa.me` link, buyer-initiated join, and deal acceptance or decline.
- **Phase 6: Payaza test payments.** Implement only documented Payaza payment-link and webhook contracts, verify signatures, deduplicate events, ledger escrow funding, and notify both parties.
- **Phase 7: Delivery and release.** Delivery updates, buyer release or issue action, fee and payout ledger entries, documented Payaza transfer flow, pending payout visibility, and deal expiry timers.
- **Phase 8: License certificate.** PDF creation, canonical-data SHA-256, QR verification URL, file storage, WhatsApp document delivery, and public verification.
- **Phase 9: React wireframe.** Auth, dashboard, deal details with timeline/ledger/messages, license list, and public verification page, using typed REST responses.
- **Phase 10: Demo hardening.** Written end-to-end demo procedure, request IDs and structured logs, webhook troubleshooting, and fixes for failures found.

## Build workflow rule

- Ensure Git is initialized before implementation if the repository has no `.git` directory.
- After each phase is implemented and tested, make a local commit with a clear phase-specific message, for example `Phase 3: WhatsApp channel`.
- Never commit `.env` or any secret, and never push unless explicitly requested.

## Assumptions and known workspace state

- The API is intended to run on port 3000 and Vite on port 5173 by default.
- Prisma CLI and client are set to 6.19.0 and lockfile installation/generation has been verified. The attempted switch to audit-suggested 6.12.0 could not install because the npm registry was unreachable. Recheck the development dependency audit when registry access is available.
- A workspace sorter moved the pre-existing prototype files from the repository root into `save/`. Those files remain present there. This build did not intentionally edit or delete the prototypes; their relocation appears in Git as deletions at the old paths and an untracked `save/` directory.
- There is no connected Meta webhook, outbound WhatsApp message, payment flow, deal conversation, or license issuance yet. Auth challenge/session plumbing is implemented, but the actual WhatsApp proof round trip awaits Phase 3.