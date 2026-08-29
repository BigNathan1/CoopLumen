# Implementation Plan: Document Balances, Transactions, and Accounts API with JSDoc + OpenAPI

## Overview

Three files receive documentation-only changes: `docs/openapi.yaml` gets its broken and duplicated path entries repaired into well-formed, standalone Path Objects; `backend/src/api/routes/balances.ts` and `backend/src/api/routes/transactions.ts` have their terse one-line comments replaced with full JSDoc blocks. No route logic, middleware, Zod schemas, database queries, or cache calls are touched.

## Tasks

- [ ] 1. Fix OpenAPI path structure for balance endpoints
  - [ ] 1.1 Remove the broken merged block that combines `/api/v1/balances/{publicKey}/history` and `/api/v1/balances/{publicKey}/loans` into one malformed path entry
    - Locate the malformed YAML block where `/history` and `/loans` share a single path key or a `parameters` list item carries a rogue `description:` sibling; delete the entire block
    - _Requirements: 1.1, 1.5_

  - [ ] 1.2 Add `/api/v1/balances/{publicKey}/history` as a standalone path entry
    - Declare `publicKey` as a required path parameter of type `string` (or `$ref` to `StellarKey`)
    - Declare `page` and `limit` as optional query parameters of type `integer` via `$ref` to shared parameter components
    - Add a single `get` operation tagged `[Balances]` with summary "Get balance-change audit history"
    - Declare 200 response referencing `BalanceHistoryResponse`, 400 referencing `ValidationError`, 500 with inline `ErrorResponse`
    - _Requirements: 1.1, 2.3, 2.4, 2.5_

  - [ ] 1.3 Ensure `/api/v1/balances/{publicKey}/loans` appears exactly once as a clean standalone path entry
    - Remove the earlier duplicate copy of this path key
    - Declare `publicKey` path parameter, `page`/`limit` query params via `$ref`, tags `[Balances, Loans]`, summary "List loans involving an address"
    - Declare 200 response with paginated `Loan` array and 400 referencing `ValidationError`
    - _Requirements: 1.2, 1.4, 2.6, 2.7, 2.8_

  - [ ] 1.4 Ensure `/api/v1/balances/community/{communityId}/loans` appears exactly once as a clean standalone path entry
    - Remove the earlier duplicate copy of this path key; keep the canonical entry
    - Confirm `communityId` path parameter, `page`/`limit` query params, 200 paginated `Loan` array, 400 referencing `ValidationError`
    - _Requirements: 1.3, 1.4, 2.9, 2.10, 2.11_

  - [ ] 1.5 Verify the entire `docs/openapi.yaml` file has no duplicate top-level path keys
    - Scan all keys under `paths:` and confirm each appears exactly once
    - _Requirements: 1.4_

- [ ] 2. Add JSDoc to `balances.ts` route handlers
  - [ ] 2.1 Add JSDoc block to `GET /:publicKey` handler
    - Document: returns all on-chain Stellar balances for the given public key, 5 s Redis cache (cache hit skips Horizon call), Horizon 429/503 retry with exponential backoff, Horizon errors mapped via `mapHorizonError`
    - Use `/** ... */` syntax placed immediately above the `balanceRouter.get(...)` call
    - Include `@route`, `@param`, `@returns` for 200 (`BalanceResponse`), 400, 404, 502, and `@see` for Redis and Horizon
    - _Requirements: 4.1, 4.6_

  - [ ] 2.2 Add JSDoc block to `GET /:publicKey/history` handler
    - Document: returns paginated `transactions_log` entries ordered newest-first, `publicKey` path param, `page`/`limit` query params, `{ data: BalanceHistoryEntry[], meta: PageMeta }` success envelope, DB errors return 500 with sanitized message
    - Use `/** ... */` syntax placed immediately above the `balanceRouter.get(...)` call
    - Include `@route`, `@param` for `publicKey`, `page`, `limit`, `@returns` for 200 (`BalanceHistoryResponse`), 400, 500, and `@see` for `transactions_log`
    - _Requirements: 4.2, 4.6_

  - [ ] 2.3 Add JSDoc block to `GET /:publicKey/loans` handler
    - Document: returns paginated loans where the address is borrower or lender, `publicKey` path param, `page`/`limit` query params, `{ data: Loan[], meta: PageMeta }` success envelope
    - Use `/** ... */` syntax placed immediately above the `balanceRouter.get(...)` call
    - Include `@route`, `@param` for `publicKey`, `page`, `limit`, `@returns` for 200 (paginated `Loan` array) and 400
    - _Requirements: 4.3, 4.6_

  - [ ] 2.4 Add JSDoc block to `GET /community/:communityId/loans` handler
    - Document: returns all loans in a community, `communityId` UUID path param, `page`/`limit` query params, `{ data: Loan[], meta: PageMeta }` success envelope
    - Use `/** ... */` syntax placed immediately above the `balanceRouter.get(...)` call
    - Include `@route`, `@param` for `communityId`, `page`, `limit`, `@returns` for 200 (paginated `Loan` array) and 400
    - _Requirements: 4.4, 4.6_

- [ ] 3. Add JSDoc to `transactions.ts` route handler
  - [ ] 3.1 Add JSDoc block to `POST /unsigned` handler
    - Document: loads source account sequence number from Horizon, builds a single-operation payment transaction envelope as unsigned XDR, does NOT sign or submit — wallet must sign and then POST to `/api/v1/tokens/transfer`
    - Document `UnsignedPaymentRequest` fields: `senderPublicKey`, `destinationPublicKey`, `assetCode`, `amount` (all required); `assetIssuer` required for non-XLM assets; `memo` optional, ≤ 28 UTF-8 bytes
    - Document success response `{ data: { xdr: string } }`, Horizon errors mapped via `mapHorizonError`, 400 on Zod validation failure, 404 if source account not found, 502 if Horizon unavailable
    - Use `/** ... */` syntax placed immediately above the handler
    - _Requirements: 3.1, 3.2, 3.3, 4.5, 4.6_

- [ ] 4. Final checkpoint — confirm no regressions
  - Run `cd backend && npm test` and confirm all 20 tests pass (14 from `balances.test.ts`, 6 from `transactions.test.ts`)
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 5.1, 5.2, 5.3_

## Notes

- No runtime code changes — only YAML structure and TypeScript comment blocks
- After all tasks: run `cd backend && npm test` and confirm 20 tests pass (14 balance + 6 transactions)
- Update `CHANGELOG.md` under `[Unreleased]` with a `docs` entry describing the OpenAPI fixes and JSDoc additions
- The YAML fix in Task 1 is the highest-risk change — verify with `npx @redocly/cli lint docs/openapi.yaml` or equivalent if available
- Tasks marked with `*` are optional and can be skipped for a faster pass (none in this plan — all tasks are required)
- Each task references specific requirements for traceability

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5", "2.1", "2.2", "2.3", "2.4", "3.1"] }
  ]
}
```
