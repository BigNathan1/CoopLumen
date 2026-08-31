# Implementation Plan: Complete establishTrustline() with Server-Side Signing


## Overview

Five targeted tasks across four files. Tasks 1 and 2 are independent and can run in parallel. Task 3 depends on Task 2 (route handler uses the updated error mapper). Tasks 4 and 5 depend on Tasks 1 and 2 respectively and can also run in parallel.

## Tasks
- [ ] 1. Add self-trustline guard to `establishTrustline()`
  - In `establishTrustline()`, after deriving `accountKeypair` from `accountSecret`, add a guard that checks `accountKeypair.publicKey() === assetIssuer` and throws `new Error('Cannot establish a trustline to your own issuer account')` if true
  - Place the guard before the `StellarService.loadAccount()` call so no network request is made for self-trustline attempts
  - Leave the rest of the function body (TransactionBuilder, sign, submit, invalidateBalanceCache, return hash) unchanged
  - **Files:** `backend/src/contracts/trustlines.ts`

- [ ] 2. Extend `horizonError.ts` with per-code status overrides and two new operation codes
  - Add a new `OPERATION_STATUS_OVERRIDES: Record<string, number>` constant mapping `op_already_exists` → 409 and `op_low_reserve` → 400
  - Add `op_already_exists: 'Trustline already exists at that limit'` and `op_low_reserve: 'Account does not have sufficient XLM reserve to add a trustline'` to the existing `OPERATION_MESSAGES` map
  - In the operations lookup block inside `mapHorizonError`, replace the hard-coded 422 status with `OPERATION_STATUS_OVERRIDES[opCode] ?? 422` so per-code overrides take effect while existing codes remain at 422
  - **Files:** `backend/src/api/utils/horizonError.ts`

- [ ] 3. Fix the `/trustline` catch block in the route handler
  - In the `POST /api/v1/tokens/trustline` route handler, replace the bare `next(err)` catch body with the same pattern used in `/burn` and `/issue`: check for `err.response`, call `mapHorizonError(err)`, and respond with the mapped status and `{ data: null, error: mapped.message }`; fall through to `next(err)` only when `.response` is absent
  - Import `mapHorizonError` at the top of the file if it is not already imported
  - **Files:** `backend/src/api/routes/tokens.ts`

- [ ] 4. Add `establishTrustline` unit tests to the existing test file
  - Add mock entries for `StellarService.submitTransaction` and `invalidateBalanceCache` to the existing `jest.mock` blocks (or add new ones if absent)
  - Add the necessary imports: `establishTrustline` from `../trustlines`, `invalidateBalanceCache` from `../../cache/balances`, and `Keypair` from `@stellar/stellar-sdk`
  - Write a `describe('establishTrustline', ...)` suite with four tests:
    1. Returns the transaction hash string on a successful submission
    2. Calls `invalidateBalanceCache` with an array containing the signing public key on success
    3. Throws `'Cannot establish a trustline to your own issuer account'` and does not call `submitTransaction` when `assetIssuer` equals the signing public key
    4. Propagates the Horizon error object (with `.response`) when `StellarService.submitTransaction` rejects
  - Use `Keypair.random()` for deterministic public/secret pair generation; use a separate `Keypair.random().publicKey()` as the distinct issuer
  - **Files:** `backend/src/contracts/__tests__/trustlines.test.ts`

- [ ] 5. Create `horizonError.test.ts` with new-code and regression tests
  - Create the file at `backend/src/api/utils/__tests__/horizonError.test.ts`
  - Add a `makeHorizonError(opCode)` helper that builds a minimal Horizon error shape with `result_codes.operations[0]` set to the given code
  - Write a `describe('mapHorizonError — trustline operation codes', ...)` suite with two tests:
    1. `op_already_exists` → status 409, message `'Trustline already exists at that limit'`
    2. `op_low_reserve` → status 400, message `'Account does not have sufficient XLM reserve to add a trustline'`
  - Write a `describe('mapHorizonError — existing codes regression', ...)` suite with three tests:
    1. `op_underfunded` → status 422
    2. `tx_bad_seq` (transaction-level code, not operation) → status 422
    3. An unmapped operation code → status 502 fallback
  - **Files:** `backend/src/api/utils/__tests__/horizonError.test.ts`


## Notes

- No new npm dependencies required.
- No database schema changes.
- All unit tests must mock StellarService and invalidateBalanceCache � no real Horizon or Redis calls.
- After all tasks complete, run cd backend && npm test to verify the full suite passes.
- Update CHANGELOG.md under [Unreleased] with an entry for the error-mapping additions and the route handler fix.
## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2"] },
    { "id": 1, "tasks": ["3"] },
    { "id": 2, "tasks": ["4", "5"] }
  ]
}
```
