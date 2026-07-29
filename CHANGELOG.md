# Changelog

All notable changes to CoopLumen are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- `backend/src/db/migrations/012_create_community_settings.sql`, an idempotent migration matching the per-community JSON config schema against the migration number originally requested in issue #38 (the `community_settings` table itself already shipped in migration 010)
- `backend/src/db/migrations/004_create_tokens.sql`, an idempotent migration matching the on-chain token metadata schema against the migration number originally requested in issue #30 (the `tokens` table itself already shipped in migration 007)
- `GET /api/v1/communities/:id/treasury` returning the treasury Stellar account balance with Zod UUID validation (#076)
- `validateParams` middleware for Zod-based path parameter validation
- `communityIdParamsSchema` Zod schema for community `:id` UUID validation
- `GET /api/v1/tokens/:assetCode/:issuer` for retrieving metadata for a single Stellar token
- `POST /api/v1/tokens/airdrop` to distribute an equal token amount to every member of a community, with Zod validation and actionable Stellar error responses.

### Fixed

- `docs/database.md`: removed a duplicated `multisig_requests` block from the ERD, a duplicated `multisig_requests` table section, a duplicated `members` row in the foreign-key summary, and repaired the `communities` indexes table, whose `idx_communities_fts` row had unescaped `|` characters splitting it across extra columns
- `POST /api/v1/tokens/issue`, `POST /api/v1/tokens/burn`, and `POST /api/v1/tokens/trustline` now return `{ data: { txHash } }` instead of a bare `{ txHash }`, matching the API's `{ data, meta?, error? }` response envelope
- The repayment-overflow `400` on `POST /api/v1/loans/:id/repay` and the validation-failure `400` from `validateBody` now nest their extra fields (`outstanding`, `errors`) under `meta` instead of returning them alongside `error` at the top level
