# Changelog

All notable changes to CoopLumen are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

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
- `POST /api/v1/tokens/burn` to reduce circulating supply by returning tokens to the issuing account
- `POST /api/v1/tokens/transfer` to submit a client-signed payment transaction on behalf of a user
- `POST /api/v1/tokens/airdrop` to distribute an equal token amount to every member of a community, with Zod validation, retry-on-transient-failure, and actionable Stellar error responses (insufficient balance mapped to `402` with the required XLM amount)
- Redis-backed caching for `GET /api/v1/balances/:publicKey` (5-second TTL), invalidated on any transfer, issuance, burn, or airdrop touching the cached address
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
- Loans API: full lifecycle — create, disburse, repay (partial/full), default, and cancel
- Loan event log and per-loan repayment summary (`GET /api/loans/:id`, `/events`)
- Borrower reputation scoring driven by loan outcomes (on-time repayments vs. defaults)
- Migration 015: loan lifecycle columns (status constraint, repayment tracking, timestamps)
- Project renamed from StellarCommons to CoopLumen
- Live `GET /health` endpoint probing DB and Stellar Horizon connectivity
- `db.ping()` and `StellarService.ping()` helpers
- Frontend `GET /api/health` Next.js route for Docker health checks
- Docker health checks for backend (30s grace) and frontend (60s grace)
- Startup env-var validation — exits early with a clear message on missing vars
- `.nvmrc` pinning Node.js 20 LTS
- `engines` field in all `package.json` files enforcing Node ≥ 20
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

- Migration 019: `members_role_check` is now re-established with a preceding `DROP CONSTRAINT IF EXISTS`, so the role contract (`admin`/`treasurer`/`member`/`observer`) is replay-safe
- Migration 020: notifications table integrity — Stellar address format constraint on the recipient, a `read_at >= created_at` guard, a non-blank `title` check, and table/column comments
- Migration 017: `transactions_log.community_id` foreign key is now `ON DELETE SET NULL` instead of the default `NO ACTION`, so deleting a community no longer fails when it has logged transactions — the audit record survives with `community_id` nulled
- `npm run db:rollback` no longer fails when rolling back `001_schema_migrations`: the tracking row is deleted before the `.down.sql` runs, so dropping the tracking table itself succeeds
- Frontend Jest config used a non-existent `setupFilesAfterFramework` key, so `jest.setup.ts` never loaded and `@testing-library/jest-dom` matchers were unavailable; corrected to `setupFilesAfterEnv`
- Frontend `type-check` failed on all test files because `@types/jest` was missing; added it to devDependencies
- Frontend ESLint extended `next/typescript`, a config not shipped by `eslint-config-next@14`, which broke `npm run lint`; dropped it (TypeScript linting is already covered by `next/core-web-vitals`)
- `docs/database.md`: synced the `loans` table reference to the current schema, and removed a duplicated `multisig_requests` ERD block/table section, a duplicated `members` row in the foreign-key summary, and a broken `communities` indexes table caused by unescaped `|` characters
- Development seed data used malformed Stellar public keys (55 characters, one containing literal filler text); replaced with well-formed 56-character StrKey addresses

---

## [0.1.0] — 2026-05-13

### Added

- Initial monorepo scaffold: Next.js 14 frontend + Node.js/Express backend + PostgreSQL
- Stellar SDK integration: asset issuance, trustlines, payments
- Community registration and member management API
- Balance dashboard with Freighter wallet integration
- Jest test setup for backend and frontend
- Docker Compose orchestration for all three services
- ESLint + TypeScript strict mode across both workspaces
- Winston structured logging
- `README.md`, `PRD.md`, `CONTRIBUTING.md`
