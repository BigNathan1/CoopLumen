# Changelog

All notable changes to CoopLumen are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- `GET /api/v1/communities/:id/treasury` returning the treasury Stellar account balance with Zod UUID validation (#076)
- `validateParams` middleware for Zod-based path parameter validation
- `communityIdParamsSchema` Zod schema for community `:id` UUID validation
- `GET /api/v1/tokens/:assetCode/:issuer` for retrieving metadata for a single Stellar token
- `POST /api/v1/tokens/airdrop` to distribute an equal token amount to every member of a community, with Zod validation and actionable Stellar error responses.

### Fixed

- `POST /api/v1/tokens/issue`, `POST /api/v1/tokens/burn`, and `POST /api/v1/tokens/trustline` now return `{ data: { txHash } }` instead of a bare `{ txHash }`, matching the API's `{ data, meta?, error? }` response envelope
- The repayment-overflow `400` on `POST /api/v1/loans/:id/repay` and the validation-failure `400` from `validateBody` now nest their extra fields (`outstanding`, `errors`) under `meta` instead of returning them alongside `error` at the top level
