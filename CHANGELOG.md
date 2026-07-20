# Changelog

All notable changes to CoopLumen are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- Frontend loan interest: the create-loan form has an optional interest-rate field with a live "total repayable" preview, and each loan card shows the rate and total due for interest-bearing loans. Outstanding-balance math (card display and the repay bound) now accounts for interest, completing the feature end-to-end
- Loan interest: loans can carry a flat `interest_rate` (percent of principal, default 0). Repayment now clears principal **plus** interest — the outstanding balance, the repayment ceiling, and the "fully repaid" transition are all computed against the total due. Migration 017 adds the column and relaxes the `amount_repaid` check accordingly; `GET /api/v1/loans/:id` now returns `total_due`, and the OpenAPI spec documents `interestRate` / `interest_rate` / `total_due`. Pre-interest loans (rate 0) behave exactly as before
- Frontend personal reputation: when a wallet is connected, a `MyReputationPanel` in the sidebar shows the member's aggregate reputation (total loans, on-time repayments, defaults) and per-community scores via a new `useReputationDetail` hook backed by `GET /api/v1/reputation/:address`. A fresh address (API 404) shows a friendly prompt instead of an error
- Frontend loan history: each loan card has a "Show history" toggle that lazily loads the loan's full event timeline (created, disbursed, repayments, closed, defaulted) via a new `useLoan` detail hook and `LoanHistory` component — surfacing the event log the backend already records. The request is deferred until the card is expanded
- Frontend loan filters: the Recent Loans section now has status and community dropdowns that drive the `useLoans` query params, so the dashboard can narrow loans by lifecycle state and community. The community filter only appears once communities are available
- Frontend loan lifecycle actions: `useLoanActions` hook and a `LoanActions` control on each loan card that drives the remaining transitions — disburse and cancel for pending loans, and repay (with an inline, outstanding-bounded amount field) and mark-defaulted for active loans. Each action revalidates both the loan and reputation caches so the dashboard stays in sync
- Frontend loan origination: `useCreateLoan` mutation hook and a `CreateLoanForm` that posts to `POST /api/v1/loans` with the connected Freighter wallet as lender, auto-fills the asset from the selected community, validates the borrower address/amount client-side, and revalidates the loan list on success. Shown on the dashboard only when a wallet is connected
- Frontend loans view: `useLoans` hook and a `LoanCard` / `LoansSection` pair that render the most recent loans on the dashboard — amount, asset, colour-coded status badge (pending/active/repaid/defaulted/cancelled), borrower/lender, and the outstanding balance for active loans
- Frontend reputation leaderboard: `useReputation` hook and a `ReputationPanel` sidebar component showing the top-ranked members (score, on-time/default tally) from the reputation API; the dashboard sidebar now renders even before a wallet is connected
- Reputation API: `GET /api/v1/reputation` (paginated, community-filterable leaderboard sorted by score) and `GET /api/v1/reputation/:address` (a member's scores across communities with an aggregate summary) — exposing the reputation the loan lifecycle already records
- OpenAPI spec now covers the full API surface: added the Loans lifecycle and Reputation endpoints (with `Loan`, `LoanEvent`, `LoanDetail`, `ReputationScore`, and related schemas) alongside the existing Communities documentation
- GitHub Actions CI (`.github/workflows/ci.yml`): lint, type-check, frontend tests, and backend tests with a PostgreSQL 16 service container so the DB integration suites run automatically on every push and PR to main
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

- Loan totals are now computed once, server-side: `GET /api/v1/loans` (the list) returns `total_due` and `outstanding` on every loan just like `GET /api/v1/loans/:id` already did, via a shared `withTotals` helper. The frontend loan card and repay control consume those fields instead of re-deriving `amount × (1 + rate)` client-side, so the interest formula lives in exactly one place. The OpenAPI `Loan` schema documents both fields.

### Fixed

- Frontend Jest config used a non-existent `setupFilesAfterFramework` key, so `jest.setup.ts` never loaded and `@testing-library/jest-dom` matchers were unavailable — every component test silently failed. Corrected to `setupFilesAfterEnv`.
- Frontend `type-check` failed on all test files because `@types/jest` was missing; added it to devDependencies.
- Frontend ESLint extended `next/typescript`, a config not shipped by `eslint-config-next@14`, which broke `npm run lint`; dropped it (TypeScript linting is already covered by `next/core-web-vitals`).

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
