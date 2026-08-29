# Requirements Document

## Introduction

This feature adds a fee estimation endpoint (`GET /api/v1/fees/estimate`) that returns the current Stellar network base fee and percentile fee distribution by querying the Horizon `feeStats` API. The endpoint is read-only, requires no input parameters, and follows the existing response envelope, error mapping, and retry conventions used throughout the CoopLumen backend.

## Glossary

- **FeeEstimationService**: The portion of `StellarServiceClass` responsible for fetching fee statistics from Horizon.
- **Horizon**: The Stellar Foundation's REST API gateway used for network queries and transaction submission.
- **stroops**: The smallest unit of XLM (1 XLM = 10,000,000 stroops). All fees returned by Horizon are expressed in stroops.
- **baseFee**: The minimum fee per operation in the current ledger, derived from Horizon's `last_ledger_base_fee` field, parsed to a number.
- **feeCharged**: The subset of percentile fee data (min, mode, p10, p50, p90, p95, p99) from the Horizon `fee_charged` object included in the response.
- **mapHorizonError**: The utility function in `api/utils/horizonError.ts` that translates Horizon error responses into a `{ status, message }` pair.
- **Response Envelope**: The standard response wrapper `{ data: ... }` for success and `{ data: null, error: string }` for errors.

## Requirements

### Requirement 1: Fee Estimate Endpoint

**User Story:** As an API consumer, I want a `GET /api/v1/fees/estimate` endpoint, so that I can retrieve the current Stellar network base fee and percentile fee distribution before constructing or submitting a transaction.

#### Acceptance Criteria

1. THE Fee Estimation Endpoint SHALL accept `GET /api/v1/fees/estimate` requests with no path parameters, query parameters, or request body.
2. WHEN the request is received, THE Fee Estimation Endpoint SHALL call `StellarService.getFeeStats()`, which internally calls `this.call('feeStats', () => this.server.feeStats())`.
3. WHEN `StellarService.getFeeStats()` resolves successfully, THE Fee Estimation Endpoint SHALL return HTTP 200 with a JSON body matching the envelope `{ "data": { "baseFee": number, "lastLedger": string, "ledgerCapacityUsage": string, "feeCharged": { "min": string, "mode": string, "p10": string, "p50": string, "p90": string, "p95": string, "p99": string } } }`.
4. THE Fee Estimation Endpoint SHALL set `baseFee` to `parseInt(feeStatsResponse.last_ledger_base_fee, 10)`.
5. THE Fee Estimation Endpoint SHALL set `lastLedger` to `feeStatsResponse.last_ledger`.
6. THE Fee Estimation Endpoint SHALL set `ledgerCapacityUsage` to `feeStatsResponse.ledger_capacity_usage`.
7. THE Fee Estimation Endpoint SHALL set `feeCharged` by selecting only the fields `min`, `mode`, `p10`, `p50`, `p90`, `p95`, and `p99` from `feeStatsResponse.fee_charged`.

### Requirement 2: Horizon Error Handling and Retry

**User Story:** As an API consumer, I want the fee endpoint to handle Stellar network failures gracefully, so that I receive a clear error response instead of an unhandled exception.

#### Acceptance Criteria

1. WHEN `StellarService.getFeeStats()` throws an error that has a `response` property, THE Fee Estimation Endpoint SHALL call `mapHorizonError(err)` and respond with `{ data: null, error: mapped.message }` using the HTTP status code returned by `mapHorizonError`.
2. WHEN Horizon responds with HTTP 429 or 503, THE FeeEstimationService SHALL retry the request with exponential backoff up to a maximum of 4 attempts as implemented by `StellarService.call()`.
3. WHEN all retry attempts are exhausted, THE Fee Estimation Endpoint SHALL propagate the final Horizon error through `mapHorizonError` and return HTTP 502 with `{ data: null, error: "Stellar network error. Please try again later." }`.
4. WHEN `StellarService.getFeeStats()` throws an error that does not have a `response` property, THE Fee Estimation Endpoint SHALL forward the error to the Express error-handling middleware via `next(err)`.

### Requirement 3: OpenAPI Documentation

**User Story:** As an API integrator, I want `GET /api/v1/fees/estimate` documented in `docs/openapi.yaml`, so that I can generate client SDKs and understand the contract without reading source code.

#### Acceptance Criteria

1. THE `docs/openapi.yaml` file SHALL include a path entry for `GET /api/v1/fees/estimate` under the `paths` key.
2. THE path entry SHALL declare a `Fees` tag and a summary of "Estimate transaction fees".
3. THE path entry SHALL document a `200` response referencing a `FeeEstimate` schema under `components/schemas`.
4. THE path entry SHALL document a `502` response for Stellar network errors.
5. THE `FeeEstimate` schema SHALL define `baseFee` as type `integer`, `lastLedger` as type `string`, `ledgerCapacityUsage` as type `string`, and `feeCharged` as an object with string properties `min`, `mode`, `p10`, `p50`, `p90`, `p95`, and `p99`.

### Requirement 4: Unit Tests

**User Story:** As a developer, I want automated tests for the fee estimate endpoint, so that regressions are caught by CI before they reach production.

#### Acceptance Criteria

1. THE test file `backend/src/api/routes/__tests__/fees.test.ts` SHALL mock `StellarService.server` using the pattern `(StellarService as unknown as { server: unknown }).server = mockServer` so that no real Horizon calls are made.
2. WHEN `feeStats` resolves with a valid Horizon response, THE test SHALL assert that the HTTP status is 200 and that the response body matches the expected data envelope with `baseFee` as a number.
3. WHEN `feeStats` rejects with a Horizon error object that has a `response.status` of 503 and a `response.data.detail`, THE test SHALL assert that the HTTP status is 502 and `response.body.error` contains the mapped error message.
4. WHEN `feeStats` rejects with a 503 error on every attempt up to the maximum retry limit, THE test SHALL assert that `feeStats` was called exactly 4 times and the final HTTP status is 502.
5. THE happy-path test SHALL assert that `baseFee` in the response body is a JavaScript number, not a string.
