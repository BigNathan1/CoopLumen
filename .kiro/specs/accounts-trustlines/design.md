# Design Document

## Overview

This document describes the design for `GET /api/v1/accounts/:publicKey/trustlines`, a read-only endpoint that surfaces all non-native Stellar asset trustlines for a given account. The implementation follows the same patterns used by the existing `balances` route and reuses the shared `StellarService`, `mapHorizonError`, and Zod validation helpers already present in the codebase.

---

## Architecture

The feature adds one new Express router file (`accounts.ts`) mounted at `/accounts` in the existing API router (`index.ts`). No new services, database queries, or cache layers are introduced — the endpoint is a thin projection over the live Horizon data already accessible via `StellarService.loadAccount()`.

```
Request
  └─ Express app
       └─ /api/v1 (apiRouter in index.ts)
            └─ /accounts (accountRouter in accounts.ts)
                 └─ GET /:publicKey/trustlines
                      ├─ Zod param validation
                      ├─ StellarService.loadAccount(publicKey)
                      │    └─ Horizon.Server.loadAccount (with 4-attempt retry)
                      ├─ filter balances where asset_type !== 'native'
                      └─ res.json({ data: trustlines })
```

---

## Components and Interfaces

### `accountRouter` (`backend/src/api/routes/accounts.ts`)

A new Express `Router` instance exporting a single route handler.

**Route:** `GET /:publicKey/trustlines`

**Parameter validation:** `accountParamsSchema` — a Zod object schema wrapping `publicKey` with an `.refine(isValidStellarPublicKey)` check. Invalid keys are rejected via the local `respondValidationError` helper, which mirrors the implementation in `balances.ts`.

**Handler logic:**
1. Parse `req.params` with `accountParamsSchema.safeParse`.
2. On validation failure: respond `400` via `respondValidationError`.
3. Call `await StellarService.loadAccount(publicKey)`.
4. Filter `account.balances` to entries where `asset_type !== 'native'`.
5. Respond `200` with `{ data: trustlines }`.
6. On caught error: if the error has a `.response` property, map it with `mapHorizonError` and respond with the mapped status/message. Otherwise, forward to Express error handler via `next(err)`.

### `apiRouter` (`backend/src/api/routes/index.ts`)

Updated to import `accountRouter` and mount it at `/accounts`:
```typescript
apiRouter.use('/accounts', accountRouter);
```

---

## Data Models

### Input

| Parameter  | Source       | Type   | Validation                              |
|------------|--------------|--------|-----------------------------------------|
| publicKey  | `req.params` | string | `isValidStellarPublicKey` (Zod refine)  |

### Output — success (`200`)

```json
{
  "data": [
    {
      "balance": "10.0000000",
      "limit": "922337203685.4775807",
      "buying_liabilities": "0.0000000",
      "selling_liabilities": "0.0000000",
      "last_modified_ledger": 2638989,
      "is_authorized": true,
      "is_authorized_to_maintain_liabilities": true,
      "asset_type": "credit_alphanum4",
      "asset_code": "USDC",
      "asset_issuer": "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
    }
  ]
}
```

An empty array `[]` is returned when the account has no non-native balances.

### Output — validation error (`400`)

```json
{
  "data": null,
  "error": "Validation failed",
  "meta": {
    "errors": [{ "path": "publicKey", "message": "publicKey must be a valid Stellar public key" }]
  }
}
```

### Output — not found (`404`)

```json
{ "data": null, "error": "Stellar account or asset not found." }
```

### Output — upstream error (`502`)

```json
{ "data": null, "error": "Stellar network error: <Horizon detail>" }
```

---

## Error Handling

| Scenario                                | Handler                      | HTTP Status |
|-----------------------------------------|------------------------------|-------------|
| Invalid `publicKey`                     | Zod `safeParse` + respond    | 400         |
| Horizon 404 (account not found)         | `mapHorizonError`            | 404         |
| Horizon 429/503 (transient, exhausted)  | `mapHorizonError` after retry| 502         |
| Non-Horizon error                       | `next(err)` → global handler | 500         |

Retry behaviour is inherited from `StellarService.withRetry`: up to 4 attempts with exponential backoff starting at 100 ms, honouring `Retry-After` headers.

---

## Testing Strategy

Tests live in `backend/src/api/routes/__tests__/accounts.test.ts` and use the same `setMockServer` + `runTimeoutsImmediately` helpers established in `balances.test.ts`.

| Test | Scenario | Assert |
|------|----------|--------|
| 1 | Invalid public key | `400`, validation error envelope |
| 2 | Account with native + trustline balances | `200`, only non-native entries returned |
| 3 | Account with native balance only | `200`, empty array |
| 4 | Horizon `404` | `404`, `'Stellar account or asset not found.'` |
| 5 | Horizon `503` exhausted | `502`, `loadAccount` called 4 times, delays 100/200/400 ms |

No database or Redis interactions are required — the `db` and `redis` mocks from the existing test setup prevent any real I/O.
