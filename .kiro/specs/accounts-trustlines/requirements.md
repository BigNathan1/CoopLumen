# Requirements Document

## 1. Trustlines Endpoint

**Requirement:** The backend must expose `GET /api/v1/accounts/:publicKey/trustlines` that returns all non-native asset trustlines established by a Stellar account.

### Acceptance Criteria

1.1 The `publicKey` path parameter is validated with Zod using `isValidStellarPublicKey`. An invalid key returns `400` with `{ data: null, error: 'Validation failed', meta: { errors: [...] } }` where each error object has a `path` field of `'publicKey'`.

1.2 When the account exists and has trustlines, the endpoint returns `200` with `{ data: Trustline[] }` where each entry is a non-native balance line from Horizon (asset_type is `credit_alphanum4` or `credit_alphanum12`).

1.3 The native XLM balance line (`asset_type === 'native'`) is always excluded from the response array.

1.4 When the account exists but has no non-native balance lines, the endpoint returns `200` with `{ data: [] }` (empty array, not null).

1.5 `StellarService.loadAccount(publicKey)` is called exactly once per successful request, and the raw Horizon balance objects are returned without transformation.

---

## 2. Horizon Error Handling

**Requirement:** The endpoint must handle Horizon errors gracefully using the shared `mapHorizonError` utility and the retry logic already built into `StellarService`.

### Acceptance Criteria

2.1 When Horizon returns a `404` (account not found), the endpoint returns `404` with `{ data: null, error: 'Stellar account or asset not found.' }`.

2.2 When Horizon returns `429` or `503`, `StellarService` retries with exponential backoff up to 4 total attempts (delays: 100 ms, 200 ms, 400 ms) before propagating the error.

2.3 After retry exhaustion, the endpoint returns `502` with `{ data: null, error: <detail from Horizon> }`.

2.4 Any non-Horizon error (no `.response` property) is forwarded to the Express error handler via `next(err)`.

---

## 3. OpenAPI Documentation

**Requirement:** The `docs/openapi.yaml` must document the new endpoint and data model.

### Acceptance Criteria

3.1 A new `Accounts` tag with description `"Stellar account state endpoints"` is added to the `tags:` array.

3.2 A path entry `GET /api/v1/accounts/{publicKey}/trustlines` is added with the `Accounts` tag, referencing `StellarKey` for the path parameter schema, and documenting `200`, `400`, `404`, and `502` responses.

3.3 A `Trustline` schema is added to `components/schemas` with required fields `asset_type`, `asset_code`, `asset_issuer`, `balance`, and `limit`, and optional fields `buying_liabilities`, `selling_liabilities`, `last_modified_ledger`, `is_authorized`, and `is_authorized_to_maintain_liabilities`.

3.4 `asset_type` in the `Trustline` schema is restricted to `enum: [credit_alphanum4, credit_alphanum12]`.

---

## 4. Unit Tests

**Requirement:** Automated tests must cover the full observable behaviour of the new endpoint using Jest + supertest with a mocked `StellarService`.

### Acceptance Criteria

4.1 A test verifies that an invalid public key returns `400` with the correct validation error envelope.

4.2 A test verifies that an account with a mix of native and non-native balances returns `200` with only the non-native entries.

4.3 A test verifies that an account with only a native balance returns `200` with an empty array.

4.4 A test verifies that a Horizon `404` error produces a `404` response with the expected message.

4.5 A test verifies that repeated Horizon `503` errors trigger exactly 4 `loadAccount` calls and produce a `502` response, and that the three `setTimeout` delays follow exponential backoff (100 ms, 200 ms, 400 ms).
