# Changelog

All notable changes to CoopLumen are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- `LoadingSkeleton` component (`frontend/src/components/LoadingSkeleton.tsx`) — animated shimmer placeholder with `text`, `circle` and `rect` variants, multi-line `count`, per-line sizing and a narrower final line for paragraph placeholders. Announced once through a polite `role="status"` live region with the bars hidden from assistive technology, and the shimmer disabled under `prefers-reduced-motion`. Colours come from new `--color-skeleton-base` / `--color-skeleton-highlight` tokens in `globals.css`, derived from the existing surface and border tokens with `color-mix` so they follow any theme change (#253).
- `frontend/src/lib/api.ts` — typed `fetch` wrapper for the backend API. Resolves the base URL from `NEXT_PUBLIC_API_URL`, injects an `Authorization` bearer header from a pluggable token provider, JSON-encodes request bodies, serialises query parameters, applies a 15s default timeout, and normalises every failure (HTTP errors, malformed bodies, network failures, aborts, timeouts) into a single `ApiError` carrying `status`, `code` and field-level `details`. Ships `api.get/post/put/patch/delete`, `requestRaw` for endpoints with pagination `meta`, and an SWR-compatible `swrFetcher` (#251).
- `claimableBalance.create(asset, amount, claimants)` in `backend/src/contracts/claimableBalance.ts` — creates a Stellar claimable balance using the `CreateClaimableBalance` operation. Accepts optional memo and time bounds; wraps Horizon interaction with error mapping so Horizon result codes (`op_low_reserve`, `op_no_trust`, `tx_bad_seq`, etc.) surface as actionable messages instead of opaque errors. Includes full unit test coverage and works with `withSequenceRetry` for concurrent submission safety (#247).
- `GET /api/v1/fees/estimate` endpoint returning current Stellar network base fee and percentile fee distribution from Horizon (#156).
- `StellarService.getFeeStats()` method wrapping `Horizon.Server.feeStats()` with the existing retry and error-mapping stack.

- `getAssetBalance(publicKey, assetCode, issuer)` helper function in `backend/src/contracts/assets.ts` to retrieve the numeric balance of an asset held by a Stellar account. Returns `0` if the account has no trustline for the asset, and throws if the account doesn't exist or network error occurs. Addresses #179.
- Comprehensive unit tests for `getAssetBalance()` covering success path, no trustline returns 0, fractional precision handling without floating-point error, native XLM not matched, multiple assets, error cases (404, 503, malformed key), and edge cases
- Testnet integration test and manual verification script for `getAssetBalance()` to validate end-to-end asset balance retrieval against actual Stellar testnet
- `StellarService.loadAccountSafe(publicKey)` method for robust, type-safe account loading with comprehensive error handling that maps Horizon errors to domain-specific exceptions: `UnfundedAccountError` for non-existent accounts, `InvalidPublicKeyError` for malformed keys, and `StellarNetworkError` for network/Horizon issues. Route handlers can now safely distinguish between "account not funded yet" and "Horizon is down" without coupling to Horizon error shapes (#173)
- Integration test script `scripts/verify-stellar-testnet.ts` (`npm run verify:stellar-testnet`) for validating `loadAccountSafe` behavior against real Stellar testnet, covering unfunded accounts, funded accounts, invalid keys, and Horizon connectivity
- `distributeAsset()` function in `backend/src/contracts/assets.ts` to distribute tokens from issuer to recipient on the Stellar network. Requires recipient to have a trustline for the asset; the function builds, signs, and submits a payment operation with proper error handling and cache invalidation. Addresses #177.
- Comprehensive unit tests for `distributeAsset()` covering successful distribution with/without memo, missing trustline (op_no_trust), insufficient balance (op_underfunded), stale sequence numbers (tx_bad_seq), and network failures
- Testnet integration test and manual verification script for `distributeAsset()` to validate end-to-end token distribution against actual Stellar testnet
- Configurable transaction time bounds (`minTime`, `maxTime`) on every transaction builder in `backend/src/contracts/` (`issueAsset`, `burnAsset`, `establishTrustline`, `submitPayment`, `buildUnsignedPayment`), via a shared `applyTimeBounds` helper that validates the window locally before it costs a Horizon round trip. Bounds accept Unix seconds, numeric strings, ISO 8601 timestamps or `Date` instances; omitting them keeps the previous 30-second expiry (#234).
- Text and hash memo support across every transaction builder in `backend/src/contracts/` (`issueAsset`, `burnAsset`, `establishTrustline`, `submitPayment`, `buildUnsignedPayment`), via a shared `buildMemo` helper that validates the memo locally before it costs a Horizon round trip (#233).
- `POST /api/v1/transactions/unsigned` now accepts `memo` as either a string (text memo, unchanged) or a tagged object `{ type: "text" | "hash" | "none", value }`, so hash memos can be requested (#233).
- `deserializeXdr(xdr)` in `backend/src/contracts/xdrDetails.ts`, decoding a base64 transaction envelope into human-readable details (source, sequence, fee in stroops and XLM, memo, time bounds, per-operation summaries, signature hints, fee-bump unwrapping), with Stellar XDR decoding failures mapped to actionable `XdrDecodeError` messages (#230).
- `validateXdr(xdr)` in `backend/src/contracts/xdrValidation.ts`, an offline check returning `{ valid, error? }` for base64 transaction envelopes, with Stellar XDR decoding failures mapped to actionable messages (#231).
- Fee-bump transaction support (`contracts/feeBump.ts`) to wrap a user's signed transaction so a sponsor account pays the network fee (#144).
- `StellarService.getNetworkPassphrase()` returning the correct network passphrase for the configured environment (#143).
- `GET /api/v1/accounts/:publicKey/trustlines` endpoint listing all non-native trustlines established by a Stellar account, added to the existing `accountsRouter` alongside `GET /api/v1/accounts/:publicKey` (#154).
- Full JSDoc documentation added to all route handlers in `balances.ts` and `transactions.ts` -- parameters, response shapes, caching TTL, Horizon retry behaviour, and external dependencies are now documented (#167).
- `docs/openapi.yaml`: fixed malformed merged `/history`+`/loans` path block, removed duplicate path key duplicates, and added `/api/v1/balances/{publicKey}/history` as a proper standalone path entry (#167).
- Integration test coverage for Redis-backed balance caching (`backend/src/cache/__tests__/`): a real-Redis suite (round-trip, TTL, expiry, invalidation, malformed-payload recovery — gated on `REDIS_URL`, matching the existing `DATABASE_URL`-gated pattern) plus a mocked-client suite covering the same behavior for CI environments without a live Redis. CI now runs a `redis:7-alpine` service so the gated suite executes on every push/PR (#171).
- `POST /api/v1/webhooks/stellar` to receive incoming Stellar account/transaction event notifications, protected by HMAC-SHA256 signature verification (`X-Stellar-Webhook-Signature`, keyed with `STELLAR_WEBHOOK_SECRET`) that fails closed when unconfigured (#170).
- In-memory, per-account sequence number cache (`contracts/sequenceCache.ts`) shared by asset issuance, burn, trustline, and airdrop payment submission, so concurrent or back-to-back Stellar submissions from the same account no longer race on a stale sequence number. Falls back to a single reload-and-retry from Horizon on `tx_bad_seq` (#169).
- Expanded `api/utils/horizonError.ts` to map the full set of known Stellar transaction and operation result codes (`tx_bad_seq`, `op_underfunded`, `tx_too_late`, `op_low_reserve`, etc.) to friendly, actionable error messages, with full unit test coverage (#166).
- `GET /api/v1/prices/xlm` returning XLM/USD market price from public feeds with Redis caching and multi-provider failover (#137).
- `StellarService.isTestnet()` and `StellarService.isMainnet()` helper methods to inspect active Stellar network configuration (#141).
- `POST /api/v1/trustlines/build` to generate unsigned trustline establishment XDR for wallet signing (#124).
- `GET /api/v1/accounts/:publicKey` returning full Stellar account details from Horizon with Zod validation, retries, and mapped error codes (#122).
- `POST /api/v1/transactions/unsigned` to build unsigned Stellar payment XDR for wallet signing (#146).
- `GET /api/v1/balances/:publicKey/history` for paginated balance-change audit history from `transactions_log` (#145).
- `GET /api/v1/communities` pagination support via `page`, `limit`, and `offset` query parameters. When `offset` is provided, it takes precedence for querying and calculates the appropriate page in the metadata.
- `npm run db:status` command showing which migrations are applied vs pending, with drift detection (#50)
- `backend/src/db/migrations/007_create_loan_repayments.sql`, an idempotent migration matching the loan repayments audit trail schema against the migration number originally requested in issue #33 (the `loan_events` table itself already shipped in migration 006)
- `backend/src/db/migrations/012_create_community_settings.sql`, an idempotent migration matching the per-community JSON config schema against the migration number originally requested in issue #38 (the `community_settings` table itself already shipped in migration 010)
- `backend/src/db/migrations/004_create_tokens.sql`, an idempotent migration matching the on-chain token metadata schema against the migration number originally requested in issue #30 (the `tokens` table itself already shipped in migration 007)
- `GET /api/v1/communities/:id/treasury` returning the treasury Stellar account balance with Zod UUID validation (#076)
- `validateParams` middleware for Zod-based path parameter validation
- `communityIdParamsSchema` Zod schema for community `:id` UUID validation
- `GET /api/v1/communities` pagination via `page`, `limit`, and `offset` query parameters; when `offset` is provided it takes precedence for querying and the response `meta.page` is back-calculated
- `npm run db:status` command showing which migrations are applied vs pending, with drift detection
- `GET /api/v1/communities/:id/treasury` returning the treasury Stellar account balance, with Zod UUID validation
- `validateParams` and `validateQuery` middleware for Zod-based path/query parameter validation
- `communityIdParamsSchema` and `getCommunitiesQuerySchema` Zod schemas
- `GET /api/v1/tokens/:assetCode/:issuer` for retrieving metadata for a single Stellar token
- `GET /api/v1/tokens/:communityId` to list all tokens issued for a community
- `GET /api/v1/tokens/holders/:assetCode/:issuer` to list accounts holding a token, backed by Horizon's asset endpoint
- `GET /api/v1/tokens/supply/:assetCode/:issuer` returning the circulating supply Horizon reports for an asset
- `GET /api/v1/tokens/history/:assetCode/:issuer` returning recent payment activity for an asset
- `signTransactionWithSecret(xdr, secret)` in `contracts/signing.ts` for server-side signing, restricted to the distributor account named by the new `STELLAR_DISTRIBUTOR_PUBLIC_KEY` env var and failing closed when it is unset (#229)
- `POST /api/v1/tokens/burn` to reduce circulating supply by returning tokens to the issuing account
- `POST /api/v1/tokens/transfer` to submit a client-signed payment transaction on behalf of a user
- `POST /api/v1/tokens/airdrop` to distribute an equal token amount to every member of a community, with Zod validation, retry-on-transient-failure, and actionable Stellar error responses (insufficient balance mapped to `402` with the required XLM amount)
- Redis-backed caching for `GET /api/v1/balances/:publicKey` (5-second TTL), invalidated on any transfer, issuance, burn, or airdrop touching the cached address
- `setTrustlineFlags()` in `contracts/trustlines.ts` for issuer-side asset authorization (`SET_FLAGS` / `CLEAR_FLAGS`), with `authorizeTrustline()` and `revokeTrustlineAuthorization()` wrappers and Horizon result codes mapped to actionable errors (#226)
- Exponential backoff retry for Horizon `429`/`503` responses (`StellarService.call`)
- `Idempotency-Key` header support on `POST /api/v1/tokens/issue`, backed by a new `idempotency_keys` table, so a retried issuance request replays the original response instead of double-minting
- Horizon/Stellar error mapping (`api/utils/horizonError.ts`) shared across the token and balance routes, turning raw Horizon result codes into actionable messages
- Community CRUD completeness: `PUT /api/v1/communities/:id` for updating name/description/settings, case-insensitive duplicate-name checks (with a database-constraint fallback for the race condition), and community statistics (`total_transactions`, `total_token_supply`) nested under `GET /api/v1/communities/:id`
- Role filter and address validation added to the `GET/PUT/DELETE /api/v1/communities/:id/members` family
- `express-rate-limit` middleware applied to all community write endpoints (10 req/min)
- Full `docs/openapi.yaml` coverage for the Communities, Members, Treasury, Tokens, and Balances API surface
- Migration runner hardening: PostgreSQL advisory lock so concurrent `db:migrate` runs cannot double-apply, SHA-256 checksums recorded in `schema_migrations.checksum` with drift detection on every run, strict `NNN_snake_case_name.sql` filename validation, numeric-prefix ordering, and a `--dry-run` flag for `db:migrate` / `db:rollback`
- Canonical `communities` schema (migration 002) with CHECK constraints mirroring the API validation and indexes for the active-community listing and asset lookup
- Database hardening migrations for audit logging, global `updated_at` triggers, membership uniqueness, and transaction history indexes, plus matching integration tests for the members, notifications, proposals, and votes schemas
- `multisig_requests`, `proposals`, `votes`, and `kyc_records` tables (dormant, prepping the multisig/governance/KYC phases)
- Three idempotent migrations (`004_create_tokens`, `007_create_loan_repayments`, `012_create_community_settings`) matching the original backlog numbering for issues #30, #33, and #38, added after the corresponding tables had already shipped under different migration numbers; each is a documented no-op on any database that already ran the real migration
- GitHub Actions CI: lint, type-check, frontend tests, and backend tests with a PostgreSQL 16 service container so the DB integration suites run automatically on every push and PR to main
- API versioning: all resource routes moved under the `/api/v1` prefix (health checks stay unversioned)
- Community avatar support: `avatar_url` column and `POST /api/v1/communities/:id/avatar` endpoint
- OpenAPI 3.0 specification for the communities API at `docs/openapi.yaml`
- Integration tests for the full community CRUD lifecycle over HTTP (real DB, gated on `DATABASE_URL`)
- `db.end()` helper for clean test teardown
- Loans API: full lifecycle â€” create, disburse, repay (partial/full), default, and cancel
- Loan event log and per-loan repayment summary (`GET /api/loans/:id`, `/events`)
- Borrower reputation scoring driven by loan outcomes (on-time repayments vs. defaults)
- Migration 015: loan lifecycle columns (status constraint, repayment tracking, timestamps)
- Project renamed from StellarCommons to CoopLumen
- Live `GET /health` endpoint probing DB and Stellar Horizon connectivity
- `db.ping()` and `StellarService.ping()` helpers
- Frontend `GET /api/health` Next.js route for Docker health checks
- Docker health checks for backend (30s grace) and frontend (60s grace)
- Startup env-var validation â€” exits early with a clear message on missing vars
- `.nvmrc` pinning Node.js 20 LTS
- `engines` field in all `package.json` files enforcing Node â‰¥ 20
- `.editorconfig` for consistent indentation and line endings
- Prettier with shared `.prettierrc` and `format` / `format:check` scripts
- `.gitattributes` enforcing LF line endings across all platforms
- Husky pre-commit hook running lint-staged
- lint-staged running ESLint + Prettier on staged files only
- commitlint enforcing Conventional Commits on every commit message
- `Makefile` with `dev`, `test`, `lint`, `format`, `migrate`, `seed`, and more
- `docker-compose.override.yml` with Node.js debugger port, verbose logging, and optional pgAdmin
- Hardened multi-stage Dockerfiles for backend and frontend
- Next.js `output: standalone` for minimal production image
- `.dockerignore` files for backend and frontend
- `CODEOWNERS`, issue templates, PR template, `SECURITY.md`, `CHANGELOG.md`

### Changed

- Replaced `express-validator` chains with Zod schemas for `/api/v1/tokens/issue` and `/api/v1/tokens/trustline` bodies, matching the validation convention used across the rest of the API
- `POST /api/v1/tokens/issue`, `POST /api/v1/tokens/burn`, and `POST /api/v1/tokens/trustline` now return `{ data: { txHash } }` instead of a bare `{ txHash }`, matching the API's `{ data, meta?, error? }` response envelope
- The repayment-overflow `400` on `POST /api/v1/loans/:id/repay` and the validation-failure `400` from `validateBody` now nest their extra fields (`outstanding`, `errors`) under `meta` instead of alongside `error` at the top level
- Added pagination metadata (`total`, `page`, `limit`, `pages`, `offset`) to `GET /api/v1/balances/:publicKey/loans`, `GET /api/v1/balances/community/:communityId/loans`, and `GET /api/v1/loans/:id/events`
- New `reputation_scores` rows now start at the neutral score `50` instead of `0`, matching the midpoint the scoring formula converges on for a member with no borrowing history
- Migration 001 is now the single source of truth for the `schema_migrations` table: the runner bootstraps by executing that file instead of an inlined copy of the DDL, and records it as applied so it is never replayed
- `schema_migrations` gained an `applied_at` index and table/column comments

### Fixed

- Restored `backend/src/contracts/transactions.ts` (`buildUnsignedPayment`), which a prior cleanup commit deleted as unused dead code without also removing its only caller, `POST /api/v1/transactions/unsigned` — leaving the backend unable to compile or run its test suite.
- Error responses across `communities.ts`, `loans.ts`, `tokens.ts`, and the shared `validateBody`/`validateParams`/`validateQuery` middleware now consistently include `data: null`, matching the `{ data, meta?, error? }` envelope documented for the rest of the API
- `docs/openapi.yaml`: added the previously undocumented Communities list/search/create, full Tokens surface (burn, trustline, community listing, holders, supply, history), Loans lifecycle, and Balances loan endpoints, and fixed several broken `$ref` pointers (`CommunityId`/`Page`/`Limit` parameters and `IssueToken`/`TokenMetadata` schemas were referenced but never defined)
- Migration 019: `members_role_check` is now re-established with a preceding `DROP CONSTRAINT IF EXISTS`, so the role contract (`admin`/`treasurer`/`member`/`observer`) is replay-safe
- Migration 020: notifications table integrity â€” Stellar address format constraint on the recipient, a `read_at >= created_at` guard, a non-blank `title` check, and table/column comments
- Migration 017: `transactions_log.community_id` foreign key is now `ON DELETE SET NULL` instead of the default `NO ACTION`, so deleting a community no longer fails when it has logged transactions â€” the audit record survives with `community_id` nulled
- `npm run db:rollback` no longer fails when rolling back `001_schema_migrations`: the tracking row is deleted before the `.down.sql` runs, so dropping the tracking table itself succeeds
- Frontend Jest config used a non-existent `setupFilesAfterFramework` key, so `jest.setup.ts` never loaded and `@testing-library/jest-dom` matchers were unavailable; corrected to `setupFilesAfterEnv`
- Frontend `type-check` failed on all test files because `@types/jest` was missing; added it to devDependencies
- Frontend ESLint extended `next/typescript`, a config not shipped by `eslint-config-next@14`, which broke `npm run lint`; dropped it (TypeScript linting is already covered by `next/core-web-vitals`)
- `docs/database.md`: synced the `loans` table reference to the current schema, and removed a duplicated `multisig_requests` ERD block/table section, a duplicated `members` row in the foreign-key summary, and a broken `communities` indexes table caused by unescaped `|` characters
- Development seed data used malformed Stellar public keys (55 characters, one containing literal filler text); replaced with well-formed 56-character StrKey addresses

---

## [0.1.0] â€” 2026-05-13

### Added

- Full JSDoc documentation added to all route handlers in `balances.ts` and `transactions.ts` -- parameters, response shapes, caching TTL, Horizon retry behaviour, and external dependencies are now documented (#167).
- `docs/openapi.yaml`: fixed malformed merged `/history`+`/loans` path block, removed duplicate path key duplicates, and added `/api/v1/balances/{publicKey}/history` as a proper standalone path entry (#167).
- Initial monorepo scaffold: Next.js 14 frontend + Node.js/Express backend + PostgreSQL
- Stellar SDK integration: asset issuance, trustlines, payments
- Community registration and member management API
- Balance dashboard with Freighter wallet integration
- Jest test setup for backend and frontend
- Docker Compose orchestration for all three services
- ESLint + TypeScript strict mode across both workspaces
- Winston structured logging
- `README.md`, `PRD.md`, `CONTRIBUTING.md`
