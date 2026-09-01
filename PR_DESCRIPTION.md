# Add StellarService.loadAccountSafe with proper error handling for unfunded accounts

## Issue

Addresses #173 (backlog reference #142)

## Summary

Added `StellarService.loadAccountSafe(publicKey)` method to the contracts layer with comprehensive error handling that maps Horizon errors to domain-specific exceptions. This enables route handlers to reliably distinguish between different failure modes (unfunded account, network outage, malformed key) without coupling to Horizon-specific error shapes.

## Changes

### Core Implementation

- **backend/src/contracts/stellar.ts**
  - Added three custom error classes, all exported for route handler use:
    - `UnfundedAccountError`: Account doesn't exist on network (Horizon 404) — actionable signal that account needs funding
    - `InvalidPublicKeyError`: Malformed public key (Horizon 400 + pattern match) — helps distinguish input validation from other 400s
    - `StellarNetworkError`: Network/Horizon connectivity issues (5xx, 429 exhaustion, connection errors) — includes optional `statusCode` field
  - Added `loadAccountSafe(publicKey)` method wrapping existing `loadAccount()` with comprehensive error mapping
  - Delegate method `handleLoadAccountError()` implements error classification logic

### Error Mapping

| Horizon Response                                | Exception               | Message                                                                           |
| ----------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------- |
| 404 Not Found                                   | `UnfundedAccountError`  | "Account {key} does not exist on the network. The account may not be funded yet." |
| 400 Bad Request (with "public key" in message)  | `InvalidPublicKeyError` | "Invalid Stellar public key format: {key}"                                        |
| 500+ Server Error                               | `StellarNetworkError`   | "Stellar network error: {detail}" or "Stellar network unavailable"                |
| 429 Too Many Requests (after retries exhausted) | `StellarNetworkError`   | "Stellar network error: {detail}"                                                 |
| Connection failure (no status)                  | `StellarNetworkError`   | "{original error message}" or "Failed to load account..."                         |

### Tests

#### Unit Tests (backend/src/contracts/**tests**/stellar.test.ts)

Comprehensive mocked tests covering:

- ✓ Successful funded account loading
- ✓ Account with multiple asset balances
- ✓ Unfunded account (404) → `UnfundedAccountError` with public key in message
- ✓ Invalid key (400 + "public key") → `InvalidPublicKeyError` with key in message
- ✓ Network errors (503, 429, 5xx) → `StellarNetworkError` with `statusCode`
- ✓ Error type discrimination (each error type is distinct and distinguishable)
- ✓ Retry behavior (verifies retry counts and exhaustion)
- ✓ Error message clarity (all messages include actionable context)

All tests use Jest mocks of `Horizon.Server` for fast, deterministic execution.

#### Integration Tests (backend/scripts/verify-stellar-testnet.ts)

Testnet verification script covering:

- ✓ Horizon connectivity via `StellarService.ping()`
- ✓ Unfunded account detection (generates fresh keypair, expects `UnfundedAccountError`)
- ✓ Funded account loading (optional, uses `STELLAR_TESTNET_FUNDED_ACCOUNT` env var)
- ✓ Invalid key handling (malformed key triggers appropriate error)
- ✓ Clear test reporting with pass/fail summary

**Usage:**

```bash
# Run unit tests (no Horizon dependency)
npm test -- stellar.test.ts

# Run testnet verification (requires Stellar testnet connectivity)
STELLAR_NETWORK=testnet npm run verify:stellar-testnet

# With a funded account (optional)
STELLAR_NETWORK=testnet STELLAR_TESTNET_FUNDED_ACCOUNT=GXXXXXX npm run verify:stellar-testnet
```

### Build & CI

- ✓ TypeScript compilation passes (`npm run build`)
- ✓ ESLint passes (`npm run lint`)
- ✓ Unit tests pass (`npm test`)
- ✓ Backward compatible (existing `loadAccount()` unchanged)

### Documentation

- Updated CHANGELOG.md with entries for both the new method and integration test script
- Created IMPLEMENTATION.md with detailed technical documentation

## Design Rationale

### Why a separate method instead of modifying `loadAccount()`?

- **Backward compatibility**: Existing callers of `loadAccount()` continue working unchanged
- **Opt-in adoption**: Route handlers can migrate to `loadAccountSafe()` at their own pace
- **Follows existing patterns**: The codebase already has wrapper methods like `call()` for retry logic

### Why custom error classes instead of raw Horizon errors?

- **Type safety**: Callers can `instanceof` check and handle errors specifically
- **Decoupling**: Route handlers don't need to know Horizon status codes or response shapes
- **Self-documenting**: Error names (`UnfundedAccountError`) are clear and actionable
- **Consistency**: Matches error-handling patterns already used elsewhere in the codebase

### Why both unit and integration tests?

- **Unit tests** run fast (mocked, no network), deterministic, suitable for CI on every PR
- **Integration tests** verify real Stellar testnet behavior, catching edge cases mocks might miss
- **Complementary coverage**: Units test error mapping logic; integration tests verify Horizon interaction

## Horizon Retry Behavior

The underlying `loadAccount()` uses exponential backoff retry with:

- **Retryable codes**: 429 (Too Many Requests), 503 (Service Unavailable)
- **Max attempts**: 4 (configurable via `HORIZON_RETRY_CONFIG`)
- **Base delay**: 100ms, doubles on each retry (100ms → 200ms → 400ms)
- **Retry-After header**: Respected if provided by Horizon
- **Non-retryable errors**: 404, 400, etc. thrown immediately without retry

## Example Usage in Route Handlers

### Before (Horizon-coupled)

```typescript
try {
  const account = await StellarService.loadAccount(publicKey);
  // use account...
} catch (err) {
  const mapped = mapHorizonError(err);
  res.status(mapped.status).json({ error: mapped.message });
}
```

### After (Clean & Type-Safe)

```typescript
import { UnfundedAccountError, StellarNetworkError } from '../contracts/stellar';

try {
  const account = await StellarService.loadAccountSafe(publicKey);
  // use account...
} catch (err) {
  if (err instanceof UnfundedAccountError) {
    res.status(400).json({ error: 'Account not funded. Send XLM first.' });
  } else if (err instanceof StellarNetworkError) {
    res.status(502).json({ error: 'Stellar network temporarily unavailable.' });
  } else if (err instanceof InvalidPublicKeyError) {
    res.status(400).json({ error: 'Invalid public key format.' });
  } else {
    throw err; // unknown error, let global handler catch it
  }
}
```

## Testing Verification Checklist

- [x] Unit tests: 30+ test cases covering success and all error paths
- [x] Integration test script: Testnet verification for unfunded/funded/invalid accounts
- [x] Build: TypeScript compilation succeeds
- [x] Lint: ESLint passes on new files
- [x] Type safety: All error classes properly exported and typed
- [x] Error messages: All include actionable context
- [x] Backward compatibility: Existing `loadAccount()` unchanged

## Scope

This change is scoped to the contracts layer error handling. It does not:

- ✗ Refactor existing route handlers (they can adopt `loadAccountSafe` at their own pace)
- ✗ Change any API endpoints or responses
- ✗ Modify database schema
- ✗ Affect other Stellar SDK calls (only `loadAccount` is wrapped)

## Future Work

1. **Gradual adoption**: Update route handlers one-by-one to use `loadAccountSafe` and handle errors specifically
2. **Error middleware**: Create middleware to catch and map service errors automatically
3. **Metrics**: Track error type frequencies to identify patterns (e.g., "unfunded accounts per day")
4. **Documentation**: Add route handler examples to CONTRIBUTING.md

## Reviewers

- [ ] Review error handling logic for correctness
- [ ] Verify test coverage is adequate
- [ ] Confirm error messages are clear and actionable
- [ ] Approve CHANGELOG entries
