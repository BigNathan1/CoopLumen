# Design Document

## Overview

Four targeted changes complete the trustline feature end-to-end:

1. **Contract layer (`trustlines.ts`)** — add a self-trustline guard that throws before any network call when the signing account is also the asset issuer. The rest of the function body is already correct; no further changes to the build/sign/submit flow are needed.
2. **Error-mapper (`horizonError.ts`)** — add two missing Horizon operation result codes (`op_already_exists`, `op_low_reserve`) to `OPERATION_MESSAGES` with their correct HTTP statuses.
3. **Route handler (`tokens.ts`)** — replace the bare `next(err)` in the `/trustline` catch block with the same `mapHorizonError()` branch used by `/burn` and `/issue`.
4. **Tests** — add unit tests for `establishTrustline()` in the existing `trustlines.test.ts` and create `horizonError.test.ts` for the two new error codes.

No schema changes, no new dependencies, no new modules.

---

## Architecture

The change touches three layers in sequence:

```
HTTP Request
    │
    ▼
Route Handler (tokens.ts)          ← Layer 3: maps errors to HTTP responses
    │
    ▼
TrustlineService (trustlines.ts)   ← Layer 1: business logic + guard
    │
    ▼
StellarService / Horizon           ← external
    │  (error thrown)
    ▼
mapHorizonError (horizonError.ts)  ← Layer 2: result-code → status + message
```

Each layer has a single responsibility:
- **Layer 1** validates inputs and orchestrates the Stellar transaction.
- **Layer 2** translates opaque Horizon result codes into structured `{ status, message }` objects.
- **Layer 3** calls Layer 1, handles the result, and delegates error formatting to Layer 2.

The guard in Layer 1 is intentionally placed before `StellarService.loadAccount()` so no network call is made for self-trustline attempts. The balance cache invalidation stays after the submit, consistent with `issueAsset` and `burnAsset`.

---

## Component Details

### 1. `trustlines.ts` — self-trustline guard

Add one guard block immediately after deriving `accountKeypair`, before `StellarService.loadAccount`:

```typescript
export async function establishTrustline(params: TrustlineParams): Promise<string> {
  const { accountSecret, assetCode, assetIssuer, limit } = params;

  const accountKeypair = Keypair.fromSecret(accountSecret);

  // Guard: a changeTrust where signer === issuer is a Stellar no-op and
  // indicates a configuration mistake. Reject early before any network call.
  if (accountKeypair.publicKey() === assetIssuer) {
    throw new Error('Cannot establish a trustline to your own issuer account');
  }

  const network = StellarService.getNetwork();
  const account = await StellarService.loadAccount(accountKeypair.publicKey());
  const asset = new Asset(assetCode, assetIssuer);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: network,
  })
    .addOperation(
      Operation.changeTrust({
        asset,
        ...(limit !== undefined && { limit }),
      })
    )
    .setTimeout(30)
    .build();

  tx.sign(accountKeypair);

  const result = await StellarService.submitTransaction(tx);
  await invalidateBalanceCache([accountKeypair.publicKey()]);
  return result.hash;
}
```

When `limit` is omitted, the Stellar SDK's `Operation.changeTrust` defaults to `'922337203685.4775807'` (the maximum trustline limit). No explicit default value needs to be set in application code.

### 2. `horizonError.ts` — two new OPERATION_MESSAGES entries

Add the two entries to the existing `OPERATION_MESSAGES` map. The HTTP status for `op_already_exists` is **409 Conflict** (the resource already exists). The HTTP status for `op_low_reserve` is **400 Bad Request** (the caller's account lacks sufficient XLM reserve — a caller-fixable condition, not a server error).

```typescript
const OPERATION_MESSAGES: Record<string, string> = {
  // existing entries — unchanged
  op_underfunded:    'Insufficient balance to complete this operation.',
  op_no_trust:       'Destination account does not have a trustline for this asset.',
  op_line_full:      "Destination account's trustline limit would be exceeded.",
  op_no_destination: 'Destination account does not exist.',
  op_src_no_trust:   'Source account does not have a trustline for this asset.',
  op_not_authorized: 'Account is not authorized to hold or transfer this asset.',

  // new entries
  op_already_exists: 'Trustline already exists at that limit',
  op_low_reserve:    'Account does not have sufficient XLM reserve to add a trustline',
};
```

The existing `mapHorizonError` function already checks `OPERATION_MESSAGES[opCode]` and returns `{ status: 422, ... }` for all operation codes. The two new codes need their own HTTP statuses, so they cannot simply be added to the map as-is — the map currently hard-codes 422 for all entries. The lookup logic must be updated to allow per-code status overrides.

**Updated lookup logic in `mapHorizonError`:**

```typescript
// Per-code HTTP status overrides. Codes not listed here default to 422.
const OPERATION_STATUS_OVERRIDES: Record<string, number> = {
  op_already_exists: 409,
  op_low_reserve:    400,
};

// Inside mapHorizonError, replace the existing operations block:
if (resultCodes?.operations?.length) {
  const opCode = resultCodes.operations[0];
  if (opCode && OPERATION_MESSAGES[opCode]) {
    const status = OPERATION_STATUS_OVERRIDES[opCode] ?? 422;
    return { status, message: OPERATION_MESSAGES[opCode] };
  }
}
```

This keeps the existing entries returning 422 with zero diff noise while allowing the two new codes to return 409 and 400 respectively.

### 3. `tokens.ts` — fix `/trustline` catch block

Replace the current bare-delegation catch block:

```typescript
// BEFORE (current code — does not map Horizon errors)
} catch (err) {
  next(err);
}
```

With the standard pattern from `/burn` and `/issue`:

```typescript
// AFTER
} catch (err) {
  if ((err as { response?: unknown }).response) {
    const mapped = mapHorizonError(err);
    res.status(mapped.status).json({ data: null, error: mapped.message });
    return;
  }
  next(err);
}
```

No other changes to this route handler are required. The self-trustline guard throws a plain `Error` (no `.response`), so it flows through `next(err)` to the global error handler — which is correct behaviour for a programming mistake detected server-side.

---

## Data Flow

### Happy path

```
POST /api/v1/tokens/trustline
  → validateBody(trustlineTokenSchema)
  → establishTrustline({ accountSecret, assetCode, assetIssuer, limit })
      → Keypair.fromSecret(accountSecret)              // derive public key
      → guard: publicKey !== assetIssuer               // passes
      → StellarService.loadAccount(publicKey)          // fetch sequence number
      → new Asset(assetCode, assetIssuer)
      → TransactionBuilder + changeTrust operation
      → tx.sign(accountKeypair)
      → StellarService.submitTransaction(tx)           // Horizon HTTP call
      → invalidateBalanceCache([publicKey])            // async Redis DEL
      → return result.hash
  ← res.status(201).json({ data: { txHash } })
```

### Error path — self-trustline guard

```
POST /api/v1/tokens/trustline
  → establishTrustline(...)
      → Keypair.fromSecret(accountSecret)
      → guard: publicKey === assetIssuer               // fires
      → throw new Error('Cannot establish a trustline to your own issuer account')
      // StellarService is never called
  → catch (err)
      → err.response is undefined                      // plain Error, no .response
      → next(err)                                      // global error handler → 500
```

### Error path — Horizon rejects (e.g. op_already_exists)

```
POST /api/v1/tokens/trustline
  → establishTrustline(...)
      → StellarService.submitTransaction(tx)
      → Horizon returns 400 with result_codes: { operations: ['op_already_exists'] }
      → SDK throws error with .response attached
  → catch (err)
      → (err as { response? }).response is truthy
      → mapHorizonError(err)
          → resultCodes.operations[0] = 'op_already_exists'
          → OPERATION_MESSAGES['op_already_exists'] = 'Trustline already exists at that limit'
          → OPERATION_STATUS_OVERRIDES['op_already_exists'] = 409
          → returns { status: 409, message: 'Trustline already exists at that limit' }
      → res.status(409).json({ data: null, error: 'Trustline already exists at that limit' })
```

### Error path — Horizon rejects (op_low_reserve)

Same flow as above; `OPERATION_STATUS_OVERRIDES['op_low_reserve']` returns 400.

---

## Testing Strategy

### `trustlines.test.ts` — add `establishTrustline` suite

**Mock setup** (add to existing `jest.mock` block):

```typescript
jest.mock('../stellar', () => ({
  StellarService: {
    getServer: jest.fn(),
    getNetwork: jest.fn().mockReturnValue('Test SDF Network ; September 2015'),
    getAccountBalance: jest.fn(),
    loadAccount: jest.fn(),
    submitTransaction: jest.fn(),           // ← add
  },
}));

jest.mock('../../cache/balances', () => ({
  invalidateBalanceCache: jest.fn().mockResolvedValue(undefined),
}));
```

Import additions needed at the top of the file:

```typescript
import { establishTrustline } from '../trustlines';
import { invalidateBalanceCache } from '../../cache/balances';
import { Keypair } from '@stellar/stellar-sdk';
```

**Test cases:**

```typescript
describe('establishTrustline', () => {
  const mockLoadAccount  = StellarService.loadAccount as jest.Mock;
  const mockSubmitTx     = StellarService.submitTransaction as jest.Mock;
  const mockInvalidate   = invalidateBalanceCache as jest.Mock;

  // Real keypair for deterministic public key derivation
  const keypair   = Keypair.random();
  const secret    = keypair.secret();
  const publicKey = keypair.publicKey();
  const assetCode   = 'ECO';
  const assetIssuer = Keypair.random().publicKey(); // distinct from signer

  // Minimal account stub — only sequence number is used by TransactionBuilder
  const accountStub = {
    id: publicKey,
    sequence: '1',
    balances: [],
    accountId: () => publicKey,
    incrementSequenceNumber: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadAccount.mockResolvedValue(accountStub);
    mockSubmitTx.mockResolvedValue({ hash: 'abc123txhash' });
  });

  it('returns the transaction hash on success', async () => {
    const hash = await establishTrustline({
      accountSecret: secret,
      assetCode,
      assetIssuer,
    });
    expect(hash).toBe('abc123txhash');
  });

  it('invalidates the balance cache for the signing public key on success', async () => {
    await establishTrustline({ accountSecret: secret, assetCode, assetIssuer });
    expect(mockInvalidate).toHaveBeenCalledWith([publicKey]);
  });

  it('throws the self-trustline guard error when assetIssuer equals the signing public key', async () => {
    await expect(
      establishTrustline({
        accountSecret: secret,
        assetCode,
        assetIssuer: publicKey, // same as signer
      })
    ).rejects.toThrow('Cannot establish a trustline to your own issuer account');
    expect(mockSubmitTx).not.toHaveBeenCalled();
  });

  it('propagates a Horizon error when StellarService.submitTransaction rejects', async () => {
    const horizonError = {
      response: {
        status: 400,
        data: {
          extras: { result_codes: { operations: ['op_already_exists'] } },
        },
      },
    };
    mockSubmitTx.mockRejectedValue(horizonError);

    await expect(
      establishTrustline({ accountSecret: secret, assetCode, assetIssuer })
    ).rejects.toMatchObject({ response: { data: { extras: { result_codes: { operations: ['op_already_exists'] } } } } });
  });
});
```

### `horizonError.test.ts` — new file at `backend/src/api/utils/__tests__/horizonError.test.ts`

```typescript
import { mapHorizonError } from '../horizonError';

/** Helper: build a minimal Horizon error shape for a single operation code */
function makeHorizonError(opCode: string) {
  return {
    response: {
      status: 400,
      data: {
        extras: { result_codes: { operations: [opCode] } },
      },
    },
  };
}

describe('mapHorizonError — trustline operation codes', () => {
  it('maps op_already_exists to 409 with correct message', () => {
    const result = mapHorizonError(makeHorizonError('op_already_exists'));
    expect(result.status).toBe(409);
    expect(result.message).toBe('Trustline already exists at that limit');
  });

  it('maps op_low_reserve to 400 with correct message', () => {
    const result = mapHorizonError(makeHorizonError('op_low_reserve'));
    expect(result.status).toBe(400);
    expect(result.message).toBe(
      'Account does not have sufficient XLM reserve to add a trustline'
    );
  });
});

describe('mapHorizonError — existing codes regression', () => {
  it('maps op_underfunded to 422', () => {
    const result = mapHorizonError(makeHorizonError('op_underfunded'));
    expect(result.status).toBe(422);
  });

  it('maps tx_bad_seq to 422', () => {
    const result = mapHorizonError({
      response: {
        status: 400,
        data: { extras: { result_codes: { transaction: 'tx_bad_seq' } } },
      },
    });
    expect(result.status).toBe(422);
  });

  it('maps an unknown code to 502 fallback', () => {
    const result = mapHorizonError(makeHorizonError('op_unknown_future_code'));
    expect(result.status).toBe(502);
  });
});
```

### Test isolation guarantees

- All tests mock `StellarService` and `invalidateBalanceCache` — no real Horizon or Redis calls.
- `Keypair.random()` provides real key derivation in-process so the self-trustline guard test uses a genuine public/secret pair without any SDK mocking.
- `jest.clearAllMocks()` in `beforeEach` prevents state leakage between tests.

---

## Error Code Reference

Complete reference for Horizon result codes relevant to trustline operations, including all existing codes for context.

| Result code | Layer | HTTP status | Message |
|---|---|---|---|
| `op_already_exists` | operation | **409** | Trustline already exists at that limit |
| `op_low_reserve` | operation | **400** | Account does not have sufficient XLM reserve to add a trustline |
| `op_underfunded` | operation | 422 | Insufficient balance to complete this operation. |
| `op_no_trust` | operation | 422 | Destination account does not have a trustline for this asset. |
| `op_line_full` | operation | 422 | Destination account's trustline limit would be exceeded. |
| `op_no_destination` | operation | 422 | Destination account does not exist. |
| `op_src_no_trust` | operation | 422 | Source account does not have a trustline for this asset. |
| `op_not_authorized` | operation | 422 | Account is not authorized to hold or transfer this asset. |
| `tx_bad_seq` | transaction | 422 | Transaction sequence number is stale; please retry. |
| `tx_insufficient_balance` | transaction | 402 | Account balance is insufficient to cover the transaction and fees. |
| `tx_insufficient_fee` | transaction | 422 | Submitted fee is below the network minimum. |
| 404 response (no result codes) | HTTP status | 404 | Stellar account or asset not found. |
| Any other / unknown | fallback | 502 | Stellar network error. Please try again later. |

The two new entries (bold) differ from the existing operation codes: `op_already_exists` returns 409 because the resource already exists (idempotent retry semantics), and `op_low_reserve` returns 400 because it is a caller-correctable condition (fund the account with more XLM), not a processing error.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Balance cache is always invalidated after a successful trustline

*For any* valid `accountSecret`, if `establishTrustline()` resolves successfully, then `invalidateBalanceCache` must be called with an array containing exactly the public key derived from that `accountSecret`.

**Validates: Requirements 1.4**

### Property 2: Transaction hash is always returned from a successful submission

*For any* successful `StellarService.submitTransaction` response that contains a `hash` field, `establishTrustline()` must return that exact hash value as a string.

**Validates: Requirements 1.5**

### Property 3: Self-trustline guard always fires before any network call

*For any* `accountSecret` whose derived public key equals `assetIssuer`, `establishTrustline()` must throw an error with the message `"Cannot establish a trustline to your own issuer account"` and `StellarService.loadAccount` and `StellarService.submitTransaction` must not be called.

**Validates: Requirements 1.6**

### Property 4: op_already_exists always maps to 409

*For any* Horizon error payload where `result_codes.operations[0]` equals `"op_already_exists"`, `mapHorizonError()` must return `{ status: 409, message: "Trustline already exists at that limit" }`.

**Validates: Requirements 2.1**

### Property 5: op_low_reserve always maps to 400

*For any* Horizon error payload where `result_codes.operations[0]` equals `"op_low_reserve"`, `mapHorizonError()` must return `{ status: 400, message: "Account does not have sufficient XLM reserve to add a trustline" }`.

**Validates: Requirements 2.2**

### Property 6: Unknown operation codes always fall through to 502

*For any* Horizon error payload where `result_codes.operations[0]` contains a code that is not present in `OPERATION_MESSAGES`, `mapHorizonError()` must return a response with HTTP status 502.

**Validates: Requirements 2.3**

### Property 7: Route handler always returns structured error envelope for Horizon errors

*For any* Horizon error thrown by `establishTrustline()` (i.e., any error with a `.response` property), the `/trustline` route handler must respond with `{ data: null, error: <string> }` at the status code returned by `mapHorizonError()`.

**Validates: Requirements 3.1, 3.2**


---

## Components and Interfaces

| Component | File | Role |
|---|---|---|
| establishTrustline(params: TrustlineParams): Promise<string> | ackend/src/contracts/trustlines.ts | Builds, signs, and submits a Stellar changeTrust operation server-side; returns transaction hash |
| hasTrustline(publicKey, assetCode, assetIssuer): Promise<boolean> | ackend/src/contracts/trustlines.ts | Queries Horizon to check whether a trustline already exists; unchanged |
| mapHorizonError(err, details?): MappedError | ackend/src/api/utils/horizonError.ts | Translates Horizon result codes into { status, message, code? } objects; extended with op_already_exists and op_low_reserve |
| POST /api/v1/tokens/trustline route handler | ackend/src/api/routes/tokens.ts | Validates request body, calls establishTrustline, maps Horizon errors via mapHorizonError |
| TrustlineParams interface | ackend/src/contracts/trustlines.ts | Input type: { accountSecret: string; assetCode: string; assetIssuer: string; limit?: string } |
| MappedError interface | ackend/src/api/utils/horizonError.ts | Output type: { status: number; message: string; code?: string; requiredXlm?: string; currentBalance?: string } |
| OPERATION_STATUS_OVERRIDES | ackend/src/api/utils/horizonError.ts | New constant map: per-code HTTP status overrides for operation result codes that deviate from the default 422 |

No new modules, no new interfaces. All changes extend existing types in-place.

---

## Data Models

No database schema changes. No new tables or columns.

The only data shape changes are internal to the error-mapper module:

### New constant: OPERATION_STATUS_OVERRIDES

`	ypescript
// backend/src/api/utils/horizonError.ts
const OPERATION_STATUS_OVERRIDES: Record<string, number> = {
  op_already_exists: 409,
  op_low_reserve:    400,
};
`

### Extended: OPERATION_MESSAGES

Two entries added to the existing Record<string, string> constant:

`	ypescript
op_already_exists: 'Trustline already exists at that limit',
op_low_reserve:    'Account does not have sufficient XLM reserve to add a trustline',
`

The TrustlineParams interface and MappedError interface are unchanged.

---

## Error Handling

All error handling follows the existing patterns in the codebase:

| Error source | Condition | Handler | HTTP response |
|---|---|---|---|
| Keypair.fromSecret | Invalid secret format | Caught by alidateBody(trustlineTokenSchema) before reaching establishTrustline | 400 |
| Self-trustline guard | ccountKeypair.publicKey() === assetIssuer | Throws 
ew Error(...) with no .response; route handler calls 
ext(err) | 500 via global error handler |
| StellarService.loadAccount | Account not found (Horizon 404) | Horizon error shape with .response; route handler calls mapHorizonError | 404 |
| StellarService.submitTransaction | Horizon result code op_already_exists | Horizon error shape with .response; mapped to 409 | 409 |
| StellarService.submitTransaction | Horizon result code op_low_reserve | Horizon error shape with .response; mapped to 400 | 400 |
| StellarService.submitTransaction | Any other mapped Horizon code | Horizon error shape with .response; mapped per existing OPERATION_MESSAGES | 422 |
| StellarService.submitTransaction | Unmapped Horizon error | Horizon error shape with .response; falls through to 502 fallback | 502 |
| invalidateBalanceCache | Redis failure | Not caught; treated as non-fatal best-effort (existing pattern) | � |
