# Design Document

## Overview

This work addresses Issue #167: fixing structural errors in `docs/openapi.yaml` and enriching the JSDoc comments on route handlers in `balances.ts` and `transactions.ts`. The OpenAPI document currently contains two categories of defect — a malformed block where the `/history` and `/loans` paths were merged into a single YAML key (producing an invalid multi-`get` structure with an orphaned `description` field), and duplicate top-level path keys for `/api/v1/balances/{publicKey}/loans` and `/api/v1/balances/community/{communityId}/loans` that cause silent data loss under any standards-compliant YAML parser. The existing route-level comments are one-liners that do not document parameters, response shapes, caching behaviour, or external dependencies.

The fix is purely documentary: two files change (`docs/openapi.yaml` and the two route handler files), zero runtime code changes. After the fix, the OpenAPI document will be structurally valid, each path will appear exactly once, all five endpoints will have complete parameter and response definitions, and every route handler will carry a full JSDoc block that developers and tooling can rely on without consulting the implementation.

---

## Architecture

Two files are modified; no module graph, dependency injection, or runtime behaviour changes.

### `docs/openapi.yaml` — structural repair

The file is a single OpenAPI 3.0.3 document. The changes are confined to the `paths:` section:

1. **Split** the merged `/api/v1/balances/{publicKey}/history` + `/api/v1/balances/{publicKey}/loans` block into two standalone, well-formed Path Objects, each with its own `parameters` list, a single `get` operation, and complete response definitions.
2. **Remove** the first (dead) copy of `/api/v1/balances/{publicKey}/loans` that currently precedes the correct community-loans block.
3. **Remove** the first (dead) copy of `/api/v1/balances/community/{communityId}/loans` that currently precedes the second copy.

All `components/schemas`, `components/parameters`, and `components/responses` referenced by the fixed paths (`BalanceHistoryResponse`, `BalanceResponse`, `Loan`, `PageMeta`, `ErrorResponse`, `ValidationError`, `StellarKey`) already exist in the document and are left unchanged.

### `backend/src/api/routes/balances.ts` — JSDoc enrichment

Four route handlers receive replacement JSDoc blocks. The one-line `/** GET … */` comments are replaced with multi-line blocks that document purpose, path/query parameters, response envelope shape, caching details, and data source. No executable code lines change.

### `backend/src/api/routes/transactions.ts` — JSDoc enrichment

One route handler receives a replacement JSDoc block. The terse one-liner is replaced with a block that documents the Horizon dependency, the unsigned XDR output, and the expected post-signing workflow. No executable code lines change.

---

## Components and Interfaces

The table below lists all five endpoints affected, their location, current documentation state, and the specific documentation gap each change closes.

| Endpoint | File | Current state | Change |
|---|---|---|---|
| `GET /api/v1/balances/{publicKey}` | `balances.ts` | One-line comment; OpenAPI path is correct and complete | Replace comment with full JSDoc: purpose, `publicKey` param, `BalanceResponse` shape, 5 s Redis cache TTL, Horizon retry/error-mapping behaviour |
| `GET /api/v1/balances/{publicKey}/history` | `balances.ts` | One-line comment; OpenAPI path is merged/broken | Replace comment with full JSDoc: purpose, `publicKey` param, `page`/`limit` query params, `BalanceHistoryResponse` + `PageMeta` envelope, `transactions_log` source table. Fix YAML path to be standalone. |
| `GET /api/v1/balances/{publicKey}/loans` | `balances.ts` | One-line comment; OpenAPI path duplicated + previously merged | Replace comment with full JSDoc: purpose, `publicKey` param, `page`/`limit` query params, paginated `Loan` array response. Fix YAML path: one canonical entry. |
| `GET /api/v1/balances/community/{communityId}/loans` | `balances.ts` | One-line comment; OpenAPI path duplicated | Replace comment with full JSDoc: purpose, `communityId` param, `page`/`limit` query params, paginated `Loan` array response. Fix YAML path: one canonical entry. |
| `POST /api/v1/transactions/unsigned` | `transactions.ts` | One-line comment; OpenAPI path is correct and complete | Replace comment with full JSDoc: purpose, `UnsignedPaymentRequest` fields, unsigned XDR output, Horizon dependency, no signing/submission, wallet must sign before calling `/tokens/transfer`. |

### JSDoc block structure (all handlers)

```typescript
/**
 * <One-sentence purpose statement.>
 *
 * @route   <METHOD> /api/v1/<path>
 * @param   {string} req.params.<param> - <description>
 * @param   {number} [req.query.page]   - <description>  (paginated handlers only)
 * @param   {number} [req.query.limit]  - <description>  (paginated handlers only)
 * @returns {200} <ResponseSchema> — <description>
 * @returns {400} ValidationErrorResponse — Zod validation failure on params/query/body
 * @returns {4xx|5xx} ErrorResponse — <description>  (handler-specific)
 * @see     <external dependency or related doc, e.g. Horizon, Redis, transactions_log>
 */
```

---

## Data Models

No data models change. The following existing schemas in `docs/openapi.yaml` are referenced by the fixed path entries and are documented here for traceability:

| Schema | Used by | Description |
|---|---|---|
| `BalanceResponse` | `GET /api/v1/balances/{publicKey}` 200 | Wrapper with `data: BalanceLine[]`; each `BalanceLine` carries `asset_type`, `asset_code`, `asset_issuer`, `balance`. |
| `BalanceHistoryEntry` | `BalanceHistoryResponse` | Single `transactions_log` row: `id`, `community_id`, `actor_address`, `action`, `stellar_tx_hash`, `metadata`, `created_at`. |
| `BalanceHistoryResponse` | `GET /api/v1/balances/{publicKey}/history` 200 | Paginated wrapper: `data: BalanceHistoryEntry[]` + `meta: PageMeta`. |
| `Loan` | Both `/loans` paths 200 | Full loan record including `borrower_address`, `lender_address`, `amount`, `asset_code`, `status`, `due_at`, timestamps. |
| `PageMeta` | All paginated 200 responses | `{ total, page, limit, pages, offset }` — all integers. |
| `ErrorResponse` | 500 (history), 502 (balances, transactions) | `{ data: null, error: string \| object }`. |
| `ValidationErrorResponse` | 400 on all five endpoints | `{ data: null, error: "Validation failed", meta: { errors: ValidationIssue[] } }`. |
| `UnsignedPaymentRequest` | `POST /api/v1/transactions/unsigned` requestBody | `senderPublicKey`, `destinationPublicKey`, `assetCode`, `amount` (required); `assetIssuer`, `memo` (optional). |
| `UnsignedPaymentResponse` | `POST /api/v1/transactions/unsigned` 200 | `{ data: { xdr: string } }` — base64-encoded unsigned transaction envelope. |
| `StellarKey` | Path parameters, schema properties | 56-character Stellar StrKey, pattern `^G[A-Z2-7]{55}$`. |

---

## Error Handling

Each endpoint's error responses are already implemented in the route handlers. The OpenAPI fixes ensure the documented responses match the actual behaviour. No error-handling code changes.

| Endpoint | Status | Condition | OpenAPI reference |
|---|---|---|---|
| `GET /api/v1/balances/{publicKey}` | 400 | `publicKey` fails Stellar key validation | `$ref: '#/components/responses/ValidationError'` |
| | 404 | Horizon reports account not found | `$ref: '#/components/responses/NotFound'` |
| | 502 | Horizon unavailable after retries | Inline `ErrorResponse` |
| `GET /api/v1/balances/{publicKey}/history` | 400 | `publicKey` or pagination params fail Zod validation | `$ref: '#/components/responses/ValidationError'` |
| | 500 | `transactions_log` query throws | Inline `ErrorResponse` (`"Failed to load balance history."`) |
| `GET /api/v1/balances/{publicKey}/loans` | 400 | `publicKey` or pagination params fail Zod validation | `$ref: '#/components/responses/ValidationError'` |
| `GET /api/v1/balances/community/{communityId}/loans` | 400 | `communityId` fails UUID validation or pagination params invalid | `$ref: '#/components/responses/ValidationError'` |
| `POST /api/v1/transactions/unsigned` | 400 | Request body fails Zod validation | Inline `ValidationErrorResponse` |
| | 404 | Horizon reports source account not found | Inline `ErrorResponse` |
| | 502 | Horizon unavailable after retries | Inline `ErrorResponse` |

All 400 responses from `balances.ts` and `transactions.ts` follow the same `respondValidationError` / inline Zod error envelope format, which maps to `ValidationErrorResponse` in the schema. The 500 from the history handler is the only endpoint that uses `next(err)` for non-Horizon errors via the global error handler; it instead catches and returns a sanitised message directly, so the inline `ErrorResponse` definition is correct.

---

## Testing Strategy

### Existing test coverage

No new tests are required. The documentation changes touch only comment blocks and YAML structure — zero runtime behaviour changes — so the existing suites provide full regression coverage.

| Test file | Location | Tests | Endpoints covered |
|---|---|---|---|
| `balances.test.ts` | `backend/src/api/routes/__tests__/` | **14** | `GET /:publicKey` (7), `GET /:publicKey/loans` (2), `GET /:publicKey/history` (5), `GET /community/:communityId/loans` (2) |
| `transactions.test.ts` | `backend/src/api/routes/__tests__/` | **6** | `POST /unsigned` (6) |

### Verification commands

Run from the `backend/` directory:

```bash
# Run only the two affected test suites
npx jest --testPathPattern="balances|transactions" --run

# Or run the full suite to confirm no regressions across the project
npx jest --run
```

Expected outcome: **20 tests pass, 0 fail**.

### YAML validation

After applying the OpenAPI fixes, validate the document with any OpenAPI 3.x linter:

```bash
# Using the openapi-cli (if installed)
npx @redocly/cli lint docs/openapi.yaml

# Or with swagger-parser
node -e "require('@apidevtools/swagger-parser').validate('docs/openapi.yaml').then(() => console.log('Valid')).catch(e => { console.error(e.message); process.exit(1); })"
```

Expected outcome: no errors, no warnings about duplicate keys or invalid `parameters` structure.

### What changed vs what did not change

| File | Lines changed | Kind |
|---|---|---|
| `docs/openapi.yaml` | ~40 lines replaced/removed in `paths:` | YAML structure only |
| `backend/src/api/routes/balances.ts` | 4 JSDoc blocks (comment lines only) | Comments only |
| `backend/src/api/routes/transactions.ts` | 1 JSDoc block (comment lines only) | Comments only |
| All other files | 0 | Unchanged |

No route logic, middleware, Zod schemas, database queries, cache calls, or Horizon interactions are modified.

---

## Correctness Properties

### Property 1: OpenAPI document contains no duplicate path keys

For any YAML parser that conforms to the YAML 1.2 specification, parsing docs/openapi.yaml must produce a paths map in which every key is unique. Specifically, /api/v1/balances/{publicKey}/loans and /api/v1/balances/community/{communityId}/loans must each appear exactly once.

**Validates: Requirements 1.2, 1.3, 1.4**

### Property 2: All five endpoints have complete response definitions

For each of the five endpoints documented in this spec, the OpenAPI path entry must declare a response definition for every HTTP status code that the route handler can return � as identified in the Error Handling table above.

**Validates: Requirements 2.2, 2.5, 2.8, 2.11, 3.2**

### Property 3: Documentation changes do not alter runtime behaviour

For any valid request to any of the five endpoints, the response status code, body shape, and side-effects (cache writes, database queries) must be identical before and after the documentation changes are applied. This is verified by the existing test suites running green.

**Validates: Requirements 5.1, 5.2, 5.3**