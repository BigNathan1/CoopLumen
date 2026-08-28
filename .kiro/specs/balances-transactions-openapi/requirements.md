# Requirements Document

## Introduction

This document covers the documentation work for Issue #167: adding JSDoc comments to route handlers in `balances.ts` and `transactions.ts`, and correcting the `docs/openapi.yaml` file so that all balance and transaction endpoints are accurately, completely, and structurally-correctly described. No new routes or business logic changes are in scope; the goal is documentation correctness and completeness.

## Glossary

- **OpenAPI Document**: The `docs/openapi.yaml` file describing the API surface using the OpenAPI 3.x specification.
- **Path Object**: A top-level entry under `paths:` in the OpenAPI Document, keyed by the URL template (e.g., `/api/v1/balances/{publicKey}`).
- **Route Handler**: A TypeScript function in `balances.ts` or `transactions.ts` that handles an Express route and is decorated with a JSDoc block.
- **JSDoc Block**: A `/** ... */` comment placed immediately above a function, documenting its purpose, parameters, return value, and notable behavior.
- **BalanceResponse**: The schema representing a Stellar account's balances as returned by `GET /api/v1/balances/{publicKey}`.
- **BalanceHistoryResponse**: The schema representing a paginated list of audit log entries returned by `GET /api/v1/balances/{publicKey}/history`.
- **PageMeta**: The schema representing pagination metadata (current page, limit, total records) included in paginated responses.
- **Loan**: The schema representing a single loan record returned in loan list endpoints.
- **UnsignedPaymentRequest**: The request body schema for `POST /api/v1/transactions/unsigned`, containing the fields needed to build an unsigned XDR transaction.
- **ValidationError**: The schema representing a 400-level error response with a human-readable message.
- **publicKey**: A Stellar account public key used as a path parameter to identify an account.
- **communityId**: An identifier for a community used as a path parameter in community-scoped endpoints.

---

## Requirements

### Requirement 1: OpenAPI Path Correctness for Balance Endpoints

**User Story:** As an API consumer reading the OpenAPI Document, I want each balance endpoint to be defined as a distinct, non-duplicated Path Object, so that tooling (validators, code generators, SDK generators) can parse and use the spec without errors.

#### Acceptance Criteria

1. WHEN the OpenAPI Document is parsed, THE OpenAPI Document SHALL contain a Path Object keyed exactly `/api/v1/balances/{publicKey}/history` as a standalone entry with its own `get` operation, not merged or nested inside any other Path Object.

2. WHEN the OpenAPI Document is parsed, THE OpenAPI Document SHALL contain the path key `/api/v1/balances/{publicKey}/loans` exactly once.

3. WHEN the OpenAPI Document is parsed, THE OpenAPI Document SHALL contain the path key `/api/v1/balances/community/{communityId}/loans` exactly once.

4. THE OpenAPI Document SHALL contain no duplicate top-level path keys anywhere under the `paths:` section.

5. THE OpenAPI Document SHALL be valid YAML such that no `description:` field appears as a sibling of a `get:` operation inside a `parameters:` list item.

---

### Requirement 2: OpenAPI Completeness for Balance Endpoints

**User Story:** As an API consumer, I want each balance route to have fully documented parameters and response schemas, so that I can integrate with the API without consulting source code.

#### Acceptance Criteria

1. WHEN the OpenAPI Document is parsed, THE Path Object for `GET /api/v1/balances/{publicKey}` SHALL declare `publicKey` as a required path parameter of type `string`.

2. WHEN the OpenAPI Document is parsed, THE Path Object for `GET /api/v1/balances/{publicKey}` SHALL declare response definitions for HTTP status codes `200` (referencing or inlining the BalanceResponse schema), `400` (referencing or inlining the ValidationError schema), `404`, and `502`.

3. WHEN the OpenAPI Document is parsed, THE Path Object for `GET /api/v1/balances/{publicKey}/history` SHALL declare `publicKey` as a required path parameter of type `string`.

4. WHEN the OpenAPI Document is parsed, THE Path Object for `GET /api/v1/balances/{publicKey}/history` SHALL declare `page` and `limit` as optional query parameters of type `integer`.

5. WHEN the OpenAPI Document is parsed, THE Path Object for `GET /api/v1/balances/{publicKey}/history` SHALL declare response definitions for HTTP status codes `200` (referencing or inlining the BalanceHistoryResponse schema, which includes a PageMeta object), `400`, and `500`.

6. WHEN the OpenAPI Document is parsed, THE Path Object for `GET /api/v1/balances/{publicKey}/loans` SHALL declare `publicKey` as a required path parameter of type `string`.

7. WHEN the OpenAPI Document is parsed, THE Path Object for `GET /api/v1/balances/{publicKey}/loans` SHALL declare `page` and `limit` as optional query parameters of type `integer`.

8. WHEN the OpenAPI Document is parsed, THE Path Object for `GET /api/v1/balances/{publicKey}/loans` SHALL declare response definitions for HTTP status codes `200` (referencing or inlining a paginated array of Loan schema objects) and `400`.

9. WHEN the OpenAPI Document is parsed, THE Path Object for `GET /api/v1/balances/community/{communityId}/loans` SHALL declare `communityId` as a required path parameter of type `string`.

10. WHEN the OpenAPI Document is parsed, THE Path Object for `GET /api/v1/balances/community/{communityId}/loans` SHALL declare `page` and `limit` as optional query parameters of type `integer`.

11. WHEN the OpenAPI Document is parsed, THE Path Object for `GET /api/v1/balances/community/{communityId}/loans` SHALL declare response definitions for HTTP status codes `200` (referencing or inlining a paginated array of Loan schema objects) and `400`.

---

### Requirement 3: OpenAPI Completeness for Transactions Endpoints

**User Story:** As an API consumer, I want the transactions endpoint to have a fully documented request body and response schemas, so that I can construct valid requests and handle all documented response cases.

#### Acceptance Criteria

1. WHEN the OpenAPI Document is parsed, THE Path Object for `POST /api/v1/transactions/unsigned` SHALL declare a `requestBody` that references or inlines the UnsignedPaymentRequest schema and marks the body as required.

2. WHEN the OpenAPI Document is parsed, THE Path Object for `POST /api/v1/transactions/unsigned` SHALL declare response definitions for HTTP status codes `200`, `400`, `404`, and `502`.

3. WHEN the OpenAPI Document is parsed, THE UnsignedPaymentRequest schema SHALL document all fields required to build an unsigned XDR transaction.

---

### Requirement 4: JSDoc on Route Handlers

**User Story:** As a developer maintaining `balances.ts` or `transactions.ts`, I want each route handler to have a complete JSDoc block, so that I can understand its purpose, parameters, return behavior, and notable side-effects without reading the full implementation.

#### Acceptance Criteria

1. THE Route Handler for `GET /api/v1/balances/:publicKey` in `balances.ts` SHALL have a JSDoc Block that documents: the handler's purpose, the `publicKey` path parameter, the shape of the success response (BalanceResponse), and the Redis cache TTL applied to successful responses.

2. THE Route Handler for `GET /api/v1/balances/:publicKey/history` in `balances.ts` SHALL have a JSDoc Block that documents: the handler's purpose, the `publicKey` path parameter, the `page` and `limit` query parameters, the shape of the success response (BalanceHistoryResponse with PageMeta), and the source table (`transactions_log`).

3. THE Route Handler for `GET /api/v1/balances/:publicKey/loans` in `balances.ts` SHALL have a JSDoc Block that documents: the handler's purpose, the `publicKey` path parameter, the `page` and `limit` query parameters, and the shape of the success response (paginated Loan array).

4. THE Route Handler for `GET /api/v1/balances/community/:communityId/loans` in `balances.ts` SHALL have a JSDoc Block that documents: the handler's purpose, the `communityId` path parameter, the `page` and `limit` query parameters, and the shape of the success response (paginated Loan array).

5. THE Route Handler for `POST /api/v1/transactions/unsigned` in `transactions.ts` SHALL have a JSDoc Block that documents: the handler's purpose, the fields of the request body (UnsignedPaymentRequest), the shape of the success response (unsigned XDR string), and the external dependency on Horizon for building the transaction.

6. THE JSDoc Block for each Route Handler SHALL use `/** ... */` syntax placed immediately above the handler function, consistent with existing JSDoc style in the codebase.

---

### Requirement 5: No Test Regressions

**User Story:** As a developer merging documentation changes, I want all existing tests to keep passing, so that documentation work does not accidentally alter runtime behavior.

#### Acceptance Criteria

1. WHEN the test suite in `balances.test.ts` is executed after documentation changes are applied, THE test runner SHALL report all 14 existing tests as passing.

2. WHEN the test suite in `transactions.test.ts` is executed after documentation changes are applied, THE test runner SHALL report all 6 existing tests as passing.

3. THE documentation changes SHALL be limited to comment blocks in `balances.ts` and `transactions.ts` and to the contents of `docs/openapi.yaml`, with no modifications to route logic, middleware, or database queries.
