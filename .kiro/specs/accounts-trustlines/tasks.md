# Implementation Plan: Add GET /api/v1/accounts/:publicKey/trustlines

## Task 1: Create route, update router, and update OpenAPI spec

- [ ] Create `backend/src/api/routes/accounts.ts` with `accountRouter`, `accountParamsSchema`, `respondValidationError`, and the `GET /:publicKey/trustlines` handler.
- [ ] Update `backend/src/api/routes/index.ts` to import `accountRouter` and mount it at `/accounts`.
- [ ] Update `docs/openapi.yaml`:
  - Add `Accounts` tag to the `tags:` array.
  - Add path entry `GET /api/v1/accounts/{publicKey}/trustlines` with `200`, `400`, `404`, `502` responses.
  - Add `Trustline` schema to `components/schemas`.

## Task 2: Create unit tests (depends on Task 1)

- [ ] Create `backend/src/api/routes/__tests__/accounts.test.ts` with 5 tests:
  1. Invalid public key returns `400` with validation error envelope.
  2. Account with trustlines returns `200` with only non-native balance entries.
  3. Account with no trustlines returns `200` with empty array.
  4. Horizon `404` returns `404` with expected error message.
  5. Horizon `503` exhaustion returns `502` with `loadAccount` called 4 times and backoff delays verified.

## Task 3: Update CHANGELOG.md (independent)

- [ ] Insert two new bullets at the top of `### Added` under `## [Unreleased]`:
  - `GET /api/v1/accounts/:publicKey/trustlines` endpoint (#154).
  - New `accountRouter` in `backend/src/api/routes/accounts.ts` (#154).
