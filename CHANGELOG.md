# Changelog

All notable changes to CoopLumen are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- Expanded the community CRUD integration suite (`backend/src/api/routes/__tests__/communities.integration.test.ts`, real DB, gated on `DATABASE_URL`) with coverage for: a `409` on duplicate name during update, the `community_created` `transactions_log` row surviving a real insert, a `404` on the avatar endpoint for a non-existent community, fetching a single member by address, a `400` on a structurally invalid Stellar address in the member path, updating and removing a member, and a `404` when updating a member that does not exist

### Fixed

- `POST /api/v1/tokens/issue`, `POST /api/v1/tokens/burn`, and `POST /api/v1/tokens/trustline` now return `{ data: { txHash } }` instead of a bare `{ txHash }`, matching the API's `{ data, meta?, error? }` response envelope
- The repayment-overflow `400` on `POST /api/v1/loans/:id/repay` and the validation-failure `400` from `validateBody` now nest their extra fields (`outstanding`, `errors`) under `meta` instead of returning them alongside `error` at the top level

### Added

- Test coverage for the structured request logger (`method`, `path`, `status`, `duration` via Winston)
- Test coverage confirming resource routes are only served under `/api/v1` and health checks stay unversioned
- Test coverage confirming `issuer_public_key`/Stellar public keys are validated as structurally valid 56-character StrKeys, not just checked for length
- `docs/openapi.yaml` entries for `POST /api/v1/tokens/issue` and `POST /api/v1/tokens/trustline`, previously undocumented
- `GET /api/v1/tokens/:communityId` to list all tokens issued for a community
- `GET /api/v1/tokens/holders/:assetCode/:issuer` to list accounts holding a token, backed by Horizon's asset endpoint
- `POST /api/v1/tokens/burn` to reduce circulating supply by returning tokens to the issuing account
- `Idempotency-Key` header support on `POST /api/v1/tokens/issue`, backed by a new `idempotency_keys` table, so a retried issuance request replays the original response instead of double-minting
- Horizon/Stellar error mapping (`api/utils/horizonError.ts`) for token issue, burn, and holder-lookup endpoints, turning raw Horizon result codes into actionable messages
- `docs/openapi.yaml` entries for the new token endpoints
- `GET /api/v1/communities/search` dedicated full-text search endpoint over community name and description, with pagination and sorting
- `docs/openapi.yaml` entry for the new search endpoint

### Changed

- Replaced `express-validator` chains with Zod schemas for `/api/v1/tokens/issue` and `/api/v1/tokens/trustline` bodies, matching the validation convention used across the rest of the API
- Removed a dead `express-validator` query check on `GET /api/v1/balances/:publicKey`
- Added pagination metadata (`total`, `page`, `limit`, `pages`) to `GET /api/v1/balances/:publicKey/loans`, `GET /api/v1/balances/community/:communityId/loans`, and `GET /api/v1/loans/:id/events`

### Added

- `POST /api/v1/tokens/airdrop` to distribute an equal token amount to every member of a community, with Zod validation and actionable Stellar error responses.

### Fixed

- `POST /api/v1/tokens/issue`, `POST /api/v1/tokens/burn`, and `POST /api/v1/tokens/trustline` now return `{ data: { txHash } }` instead of a bare `{ txHash }`, matching the API's `{ data, meta?, error? }` response envelope
- The repayment-overflow `400` on `POST /api/v1/loans/:id/repay` and the validation-failure `400` from `validateBody` now nest their extra fields (`outstanding`, `errors`) under `meta` instead of returning them alongside `error` at the top level
