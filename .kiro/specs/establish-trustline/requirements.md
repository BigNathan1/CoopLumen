# Requirements Document

## Introduction

This feature completes the `establishTrustline()` function in `trustlines.ts` so that it builds, signs, and submits a Stellar `changeTrust` operation entirely on the server side, consistent with how `burnTokens()` and `issueTokens()` are implemented. It also closes three related gaps: two missing Horizon result codes (`op_already_exists`, `op_low_reserve`) are added to the error-mapping layer, the POST `/api/v1/tokens/trustline` route handler is corrected to use `mapHorizonError()` instead of forwarding raw Horizon errors, and unit tests are added to cover `establishTrustline()` and the new error codes. Together these changes make trustline creation reliable, return actionable error messages to callers, and keep the test suite fast through Horizon mocking.

## Glossary

- **TrustlineService**: The module in `trustlines.ts` that exposes `establishTrustline()` and `hasTrustline()`.
- **StellarService**: The shared wrapper around the Stellar SDK and Horizon HTTP client used to build and submit transactions.
- **mapHorizonError**: The utility function in `horizonError.ts` that converts a Horizon error response into a structured `{ status, message }` object.
- **changeTrust operation**: A Stellar operation that creates or modifies a trustline between an account and an asset issuer.
- **Balance cache**: The in-memory or Redis cache that stores account balance data, keyed by account public key.
- **Self-trustline**: A `changeTrust` operation where the signing account's public key is the same as the asset issuer, which is a Stellar no-op and indicates a configuration mistake.

## Requirements

### Requirement 1: establishTrustline Contract and Server-Side Signing

**User Story:** As a backend service consumer, I want `establishTrustline()` to accept account credentials and asset details, sign the transaction on the server, and return a transaction hash, so that callers can create trustlines without managing Stellar key material or raw transactions.

#### Acceptance Criteria

1. THE `TrustlineService` SHALL accept `accountSecret` (string), `assetCode` (string), `assetIssuer` (string), and an optional `limit` (string) as inputs to `establishTrustline()`.
2. WHEN `establishTrustline()` is called, THE `TrustlineService` SHALL derive the account's public key from `accountSecret` and build a `changeTrust` operation using `StellarService`.
3. WHEN `establishTrustline()` is called, THE `TrustlineService` SHALL sign the transaction with `accountSecret` server-side before submitting it to Horizon via `StellarService`.
4. WHEN the Horizon submission succeeds, THE `TrustlineService` SHALL invalidate the balance cache entry for the signing account's public key.
5. WHEN the Horizon submission succeeds, THE `TrustlineService` SHALL return the transaction hash as a string.
6. WHEN `accountSecret` derives a public key that equals `assetIssuer`, THE `TrustlineService` SHALL throw an error with the message `"Cannot establish a trustline to your own issuer account"` before submitting any transaction to Horizon.
7. WHERE `limit` is not provided, THE `TrustlineService` SHALL use the Stellar SDK default maximum trustline limit.

### Requirement 2: Horizon Error Mapping for Trustline Operations

**User Story:** As a developer integrating the trustline API, I want Horizon error codes specific to trustline operations to produce clear, human-readable messages, so that I can diagnose and fix issues without parsing raw Horizon responses.

#### Acceptance Criteria

1. WHEN `mapHorizonError()` receives a Horizon error containing result code `op_already_exists`, THE `mapHorizonError` function SHALL return the message `"Trustline already exists at that limit"` with HTTP status 409.
2. WHEN `mapHorizonError()` receives a Horizon error containing result code `op_low_reserve`, THE `mapHorizonError` function SHALL return the message `"Account does not have sufficient XLM reserve to add a trustline"` with HTTP status 400.
3. THE `mapHorizonError` function SHALL continue to handle all previously supported result codes (`op_underfunded`, `tx_bad_seq`, and others) without regression.

### Requirement 3: Route Handler Error Propagation

**User Story:** As an API consumer, I want the `POST /api/v1/tokens/trustline` endpoint to return structured, mapped error responses for Horizon failures, so that I receive consistent error envelopes instead of raw Stellar SDK errors.

#### Acceptance Criteria

1. WHEN the `POST /api/v1/tokens/trustline` handler catches an error that has a `.response` property (indicating a Horizon error), THE route handler SHALL call `mapHorizonError()` to obtain the HTTP status and message.
2. WHEN `mapHorizonError()` returns a result, THE route handler SHALL respond with the mapped HTTP status and a JSON body of the shape `{ "data": null, "error": "<mapped message>" }`.
3. WHEN the `POST /api/v1/tokens/trustline` handler catches an error that does not have a `.response` property, THE route handler SHALL call `next(err)` to delegate to the global error handler.
4. THE route handler's error-handling behavior SHALL be consistent with the `POST /api/v1/tokens/burn` and `POST /api/v1/tokens/issue` route handlers.

### Requirement 4: Unit Tests for establishTrustline

**User Story:** As a developer maintaining the codebase, I want unit tests for `establishTrustline()` that mock `StellarService` and Horizon, so that the test suite remains fast and deterministic.

#### Acceptance Criteria

1. THE test suite SHALL include a test that verifies `establishTrustline()` returns the transaction hash when `StellarService` resolves successfully.
2. THE test suite SHALL include a test that verifies the balance cache is invalidated for the signing account's public key when `establishTrustline()` succeeds.
3. THE test suite SHALL include a test that verifies `establishTrustline()` throws the self-trustline guard error when `accountSecret` derives a public key matching `assetIssuer`.
4. THE test suite SHALL include a test that verifies `establishTrustline()` propagates a mapped Horizon error when `StellarService` rejects with a Horizon error response.
5. WHILE running the unit tests, THE test suite SHALL use mocked `StellarService` responses and SHALL NOT make real network requests to Horizon or any Stellar testnet.

### Requirement 5: Unit Tests for New Horizon Error Codes

**User Story:** As a developer maintaining the error-mapping layer, I want unit tests for the `op_already_exists` and `op_low_reserve` result codes in `mapHorizonError()`, so that regressions in error mapping are caught automatically.

#### Acceptance Criteria

1. THE test suite SHALL include a test that verifies `mapHorizonError()` returns HTTP status 409 and the message `"Trustline already exists at that limit"` when given a Horizon error with result code `op_already_exists`.
2. THE test suite SHALL include a test that verifies `mapHorizonError()` returns HTTP status 400 and the message `"Account does not have sufficient XLM reserve to add a trustline"` when given a Horizon error with result code `op_low_reserve`.
