# Implementation Plan: Add Fee Estimation Endpoint

## Overview

Implement `GET /api/v1/fees/estimate` following the existing CoopLumen patterns for Horizon calls, error mapping, and response envelopes. The work consists of five discrete steps: adding the service method, creating the route, registering it, updating the OpenAPI spec, and writing tests. Tasks 1 and 4 are independent and can start in parallel; task 2 depends on task 1; tasks 3 and 5 depend on task 2.

## Tasks

- [ ] 1. Add `getFeeStats()` to `StellarService`
  - In `backend/src/contracts/stellar.ts`, add the following method to `StellarServiceClass` after `getTransactionHistory()`:
    ```typescript
    async getFeeStats(): Promise<Horizon.ServerApi.FeeStatsRecord> {
      return this.call('feeStats', () => this.server.feeStats());
    }
    ```
  - No imports are needed — `Horizon` is already imported at the top of the file.
  - _Requirements: 1.2_

- [ ] 2. Create `backend/src/api/routes/fees.ts`
  - Create the file with `feeRouter` exported as a named export.
  - Implement `GET /estimate` as an async route handler that calls `StellarService.getFeeStats()`.
  - Transform the Horizon response: `baseFee = parseInt(stats.last_ledger_base_fee, 10)`, pass through `lastLedger` and `ledgerCapacityUsage`, and project `feeCharged` to only `{ min, mode, p10, p50, p90, p95, p99 }`.
  - On success, return `res.json({ data: { baseFee, lastLedger, ledgerCapacityUsage, feeCharged } })`.
  - On error with a `response` property, call `mapHorizonError(err)` and return `res.status(mapped.status).json({ data: null, error: mapped.message })`.
  - On error without a `response` property, call `next(err)`.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.4_

- [ ] 3. Register `feeRouter` in `backend/src/api/routes/index.ts`
  - Add `import { feeRouter } from './fees';` alongside the other router imports.
  - Add `apiRouter.use('/fees', feeRouter);` after the existing `apiRouter.use(...)` lines.
  - _Requirements: 1.1_

- [ ] 4. Add `GET /api/v1/fees/estimate` to `docs/openapi.yaml`
  - Add a `Fees` entry to the `tags` array at the top of the file.
  - Under `paths`, add:
    ```yaml
    /api/v1/fees/estimate:
      get:
        tags: [Fees]
        summary: Estimate transaction fees
        description: Returns the current Stellar network base fee and key percentile fee distribution from Horizon.
        responses:
          '200':
            description: Current fee statistics
            content:
              application/json:
                schema:
                  type: object
                  properties:
                    data:
                      $ref: '#/components/schemas/FeeEstimate'
          '502':
            description: Stellar network error
            content:
              application/json:
                schema:
                  $ref: '#/components/schemas/ErrorResponse'
    ```
  - Under `components/schemas`, add:
    ```yaml
    FeeEstimate:
      type: object
      required: [baseFee, lastLedger, ledgerCapacityUsage, feeCharged]
      properties:
        baseFee:
          type: integer
          description: Minimum fee per operation in stroops (parsed from last_ledger_base_fee)
          example: 100
        lastLedger:
          type: string
          description: Sequence number of the most recent ledger used for fee calculation
          example: "4372364"
        ledgerCapacityUsage:
          type: string
          description: Fraction of ledger capacity used in the recent sample (0.0–1.0)
          example: "0.07"
        feeCharged:
          type: object
          required: [min, mode, p10, p50, p90, p95, p99]
          properties:
            min:  { type: string, example: "100" }
            mode: { type: string, example: "100" }
            p10:  { type: string, example: "100" }
            p50:  { type: string, example: "100" }
            p90:  { type: string, example: "95947" }
            p95:  { type: string, example: "154834" }
            p99:  { type: string, example: "706514" }
    ```
  - If `ErrorResponse` is not already defined under `components/schemas`, add it:
    ```yaml
    ErrorResponse:
      type: object
      properties:
        data:
          nullable: true
          example: null
        error:
          type: string
          example: "Stellar network error. Please try again later."
    ```
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 5. Create `backend/src/api/routes/__tests__/fees.test.ts`
  - Follow the mock setup pattern from `balances.test.ts`: mock the `logger`, import `app` and `StellarService` after mocks, define `setMockServer()` and `runTimeoutsImmediately()` helpers.
  - Define a `MOCK_FEE_STATS` constant with all 14 `fee_charged` fields and both `fee_charged` and `max_fee` keys.
  - Write four tests inside `describe('GET /api/v1/fees/estimate')`:

    **Test (a) — happy path shape**
    - Mock `feeStats` to resolve with `MOCK_FEE_STATS`.
    - `GET /api/v1/fees/estimate` should return status 200 and a body matching the full expected envelope (including all 7 `feeCharged` keys with correct string values).
    - _Requirements: 1.3, 1.5, 1.6, 1.7, 4.2_

    **Test (b) — baseFee is a number**
    - Mock `feeStats` to resolve with `MOCK_FEE_STATS`.
    - Assert `typeof response.body.data.baseFee === 'number'`.
    - _Requirements: 1.4, 4.5_

    **Test (c) — Horizon error returns 502**
    - Mock `feeStats` to reject once with `{ response: { status: 503, data: { detail: 'Horizon unavailable' } } }`.
    - Assert status 502 and `response.body.error === 'Stellar network error: Horizon unavailable'`.
    - _Requirements: 2.1, 4.3_

    **Test (d) — retry exhaustion calls feeStats 4 times**
    - Call `runTimeoutsImmediately()` to fast-forward backoff delays.
    - Mock `feeStats` to always reject with `{ response: { status: 503, data: { detail: 'Service unavailable' } } }`.
    - Assert status 502, `feeStats` called exactly 4 times, and the three `setTimeout` calls used delays 100 ms, 200 ms, 400 ms.
    - _Requirements: 2.2, 2.3, 4.4_

  - [ ]* 5.1 Write property test: baseFee numeric conversion
    - **Property 1: baseFee is the integer parse of last_ledger_base_fee**
    - For any valid `last_ledger_base_fee` string (e.g. generated as a random non-negative integer string), construct a minimal `feeStats` mock response, call the route, and assert that `response.body.data.baseFee === parseInt(value, 10)` and `typeof response.body.data.baseFee === 'number'`.
    - Use a property-based testing library (e.g. `fast-check`) to generate varied numeric strings.
    - **Validates: Requirements 1.4**

  - [ ]* 5.2 Write property test: feeCharged projection
    - **Property 2: feeCharged projection selects exactly the specified subset**
    - For any Horizon `feeStats` response with arbitrary string values for all 14 `fee_charged` fields, assert that the response `feeCharged` object contains exactly the keys `min`, `mode`, `p10`, `p50`, `p90`, `p95`, `p99` — with matching string values — and contains no additional keys.
    - **Validates: Requirements 1.3, 1.7**

- [ ] 6. Checkpoint — ensure all tests pass
  - Run `jest --testPathPattern fees.test.ts --runInBand` (or the project's standard test command) to confirm all four required tests pass.
  - Ensure all tests pass; ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP.
- Tasks 1 and 4 are independent and can be worked on in parallel (see dependency graph).
- Task 5 optional sub-tasks (5.1, 5.2) require `fast-check` or an equivalent property-based testing library; install it as a dev dependency if not already present.
- All Horizon retry behaviour (`withRetry`, 429/503 handling, exponential backoff) is inherited from the existing `StellarService.call()` implementation — no changes to retry logic are needed.
- The `feeCharged` projection deliberately omits `max`, `p20`, `p30`, `p40`, `p60`, `p70`, and `p80` to keep the response compact.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "4"] },
    { "id": 1, "tasks": ["2"] },
    { "id": 2, "tasks": ["3", "5", "5.1", "5.2"] }
  ]
}
```
