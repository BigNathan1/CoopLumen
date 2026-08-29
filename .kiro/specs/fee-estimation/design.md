# Design Document

## Overview

The fee estimation feature adds a single read-only endpoint, `GET /api/v1/fees/estimate`, to the CoopLumen backend. The endpoint fetches current network fee statistics from the Stellar Horizon API via `StellarService`, transforms the raw response into a trimmed envelope, and returns it to the caller. No database interaction, caching, or request validation is required since there are no inputs.

The feature touches four files:

| File | Change |
|------|--------|
| `backend/src/contracts/stellar.ts` | Add `getFeeStats()` method to `StellarServiceClass` |
| `backend/src/api/routes/fees.ts` | New router file with `GET /estimate` handler |
| `backend/src/api/routes/index.ts` | Mount `feeRouter` under `/fees` |
| `docs/openapi.yaml` | Add path entry and `FeeEstimate` schema |

## Architecture

```
Client
  │
  └─► GET /api/v1/fees/estimate
        │
        ▼
  Express feeRouter (fees.ts)
        │
        ├─► StellarService.getFeeStats()
        │         │
        │         └─► StellarService.call('feeStats', () => server.feeStats())
        │                   │
        │                   └─► Horizon.Server.feeStats()  [with retry]
        │
        ├── success ──► shape transform ──► { data: { baseFee, lastLedger, ... } }
        │
        └── error  ──► mapHorizonError(err) ──► { data: null, error: string }
```

The retry logic (exponential backoff, max 4 attempts, handles 429 and 503) is already embedded in `StellarService.call()` / `withRetry()`, so `getFeeStats()` inherits it for free.

## Components and Interfaces

### 1. `StellarServiceClass.getFeeStats()` — `backend/src/contracts/stellar.ts`

Add the following method to `StellarServiceClass` after the existing `getTransactionHistory()` method:

```typescript
async getFeeStats(): Promise<Horizon.ServerApi.FeeStatsRecord> {
  return this.call('feeStats', () => this.server.feeStats());
}
```

`Horizon.ServerApi.FeeStatsRecord` is the type inferred from the SDK for the object returned by `server.feeStats()`. Using `this.call()` (the public wrapper around `withRetry`) keeps the retry and logging behaviour consistent with all other Horizon operations in the service.

### 2. `feeRouter` — `backend/src/api/routes/fees.ts`

New router file, fully self-contained:

```typescript
import { Router, Request, Response, NextFunction } from 'express';
import { StellarService } from '../../contracts/stellar';
import { mapHorizonError } from '../utils/horizonError';

export const feeRouter = Router();

/**
 * GET /api/v1/fees/estimate
 * Returns the current Stellar network base fee and key percentile fee distribution.
 */
feeRouter.get('/estimate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await StellarService.getFeeStats();

    res.json({
      data: {
        baseFee: parseInt(stats.last_ledger_base_fee, 10),
        lastLedger: stats.last_ledger,
        ledgerCapacityUsage: stats.ledger_capacity_usage,
        feeCharged: {
          min:  stats.fee_charged.min,
          mode: stats.fee_charged.mode,
          p10:  stats.fee_charged.p10,
          p50:  stats.fee_charged.p50,
          p90:  stats.fee_charged.p90,
          p95:  stats.fee_charged.p95,
          p99:  stats.fee_charged.p99,
        },
      },
    });
  } catch (err) {
    if ((err as { response?: unknown }).response) {
      const mapped = mapHorizonError(err);
      res.status(mapped.status).json({ data: null, error: mapped.message });
      return;
    }
    next(err);
  }
});
```

### 3. Router registration — `backend/src/api/routes/index.ts`

Add two lines mirroring the existing pattern:

```typescript
import { feeRouter } from './fees';
// ...
apiRouter.use('/fees', feeRouter);
```

The full updated `index.ts` becomes:

```typescript
import { Router } from 'express';
import { communityRouter } from './communities';
import { tokenRouter } from './tokens';
import { balanceRouter } from './balances';
import { loanRouter } from './loans';
import { transactionRouter } from './transactions';
import { feeRouter } from './fees';

export const apiRouter = Router();

apiRouter.use('/communities', communityRouter);
apiRouter.use('/tokens', tokenRouter);
apiRouter.use('/balances', balanceRouter);
apiRouter.use('/loans', loanRouter);
apiRouter.use('/transactions', transactionRouter);
apiRouter.use('/fees', feeRouter);
```

## Data Models

### Horizon Input (`Horizon.ServerApi.FeeStatsRecord` — abridged)

```typescript
{
  last_ledger: string;            // e.g. "4372364"
  last_ledger_base_fee: string;   // e.g. "100"
  ledger_capacity_usage: string;  // e.g. "0.07"
  fee_charged: {
    max: string; min: string; mode: string;
    p10: string; p20: string; p30: string; p40: string; p50: string;
    p60: string; p70: string; p80: string; p90: string; p95: string; p99: string;
  };
  max_fee: { /* same shape as fee_charged */ };
}
```

### API Response Shape

```typescript
interface FeeEstimateResponse {
  data: {
    baseFee: number;             // parseInt(last_ledger_base_fee, 10)
    lastLedger: string;          // last_ledger
    ledgerCapacityUsage: string; // ledger_capacity_usage
    feeCharged: {
      min:  string;
      mode: string;
      p10:  string;
      p50:  string;
      p90:  string;
      p95:  string;
      p99:  string;
    };
  };
}
```

**Field projection**: The response intentionally omits `max_fee`, `fee_charged.max`, and the intermediate percentile buckets (p20–p80 except p50) to keep the payload compact and focused on the values most relevant to transaction fee selection.

### Error Response Shape (unchanged from existing convention)

```typescript
interface ErrorResponse {
  data: null;
  error: string;
}
```

## Error Handling

| Scenario | Horizon status | Route handler response |
|----------|---------------|------------------------|
| Horizon temporarily rate-limited | 429 | Retried automatically (up to 4 attempts via `StellarService.call`) |
| Horizon temporarily unavailable | 503 | Retried automatically (up to 4 attempts) |
| All retries exhausted | 429 or 503 | `502 { data: null, error: "Stellar network error. Please try again later." }` |
| Horizon returns a non-retryable error | any other 4xx/5xx | `mapHorizonError` maps to the appropriate status (404 → 404, others → 502) |
| Non-Horizon error (bug, network issue without `.response`) | — | Forwarded to Express error middleware via `next(err)` |

The error detection heuristic used throughout the codebase is `(err as { response?: unknown }).response` — if the error has a `response` property it is treated as a Horizon error and passed to `mapHorizonError`; otherwise it is forwarded to the global error handler.

## Testing Strategy

### Test File: `backend/src/api/routes/__tests__/fees.test.ts`

The test file follows the exact mock setup pattern from `balances.test.ts`:

```typescript
import request from 'supertest';

jest.mock('../../../utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import app from '../../../app';
import { StellarService } from '../../../contracts/stellar';

function setMockServer(server: unknown): void {
  (StellarService as unknown as { server: unknown }).server = server;
}

function runTimeoutsImmediately(): jest.SpyInstance {
  return jest.spyOn(global, 'setTimeout').mockImplementation(((
    callback: (...args: unknown[]) => void
  ) => {
    if (typeof callback === 'function') callback();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout);
}

const MOCK_FEE_STATS = {
  last_ledger: '4372364',
  last_ledger_base_fee: '100',
  ledger_capacity_usage: '0.07',
  fee_charged: {
    max: '1000', min: '100', mode: '100',
    p10: '100', p20: '100', p30: '100', p40: '100', p50: '100',
    p60: '100', p70: '100', p80: '100', p90: '95947',
    p95: '154834', p99: '706514',
  },
  max_fee: {
    max: '1000', min: '100', mode: '100',
    p10: '100', p20: '100', p30: '100', p40: '100', p50: '100',
    p60: '100', p70: '100', p80: '100', p90: '95947',
    p95: '154834', p99: '706514',
  },
};

describe('fee routes', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

  describe('GET /api/v1/fees/estimate', () => {
    it('returns 200 with the correct data shape on success', async () => {
      const feeStats = jest.fn().mockResolvedValueOnce(MOCK_FEE_STATS);
      setMockServer({ feeStats });

      const response = await request(app).get('/api/v1/fees/estimate');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        data: {
          baseFee: 100,
          lastLedger: '4372364',
          ledgerCapacityUsage: '0.07',
          feeCharged: {
            min: '100', mode: '100',
            p10: '100', p50: '100',
            p90: '95947', p95: '154834', p99: '706514',
          },
        },
      });
    });

    it('returns a number for baseFee, not a string', async () => {
      const feeStats = jest.fn().mockResolvedValueOnce(MOCK_FEE_STATS);
      setMockServer({ feeStats });

      const response = await request(app).get('/api/v1/fees/estimate');

      expect(typeof response.body.data.baseFee).toBe('number');
    });

    it('returns 502 when Horizon returns an error', async () => {
      const feeStats = jest.fn().mockRejectedValueOnce({
        response: { status: 503, data: { detail: 'Horizon unavailable' } },
      });
      setMockServer({ feeStats });

      const response = await request(app).get('/api/v1/fees/estimate');

      expect(response.status).toBe(502);
      expect(response.body).toEqual({
        data: null,
        error: 'Stellar network error: Horizon unavailable',
      });
    });

    it('returns 502 after retry exhaustion (feeStats called 4 times)', async () => {
      const setTimeoutSpy = runTimeoutsImmediately();
      const feeStats = jest
        .fn()
        .mockRejectedValue({ response: { status: 503, data: { detail: 'Service unavailable' } } });
      setMockServer({ feeStats });

      const response = await request(app).get('/api/v1/fees/estimate');

      expect(response.status).toBe(502);
      expect(feeStats).toHaveBeenCalledTimes(4);
      expect(setTimeoutSpy).toHaveBeenNthCalledWith(1, expect.any(Function), 100);
      expect(setTimeoutSpy).toHaveBeenNthCalledWith(2, expect.any(Function), 200);
      expect(setTimeoutSpy).toHaveBeenNthCalledWith(3, expect.any(Function), 400);
    });
  });
});
```

### Unit Testing Balance

- **Example-based tests** cover: happy-path shape, Horizon error mapping (502), retry exhaustion (4 calls), `baseFee` type assertion.
- **No property-based tests** are added for the route handler itself because the route's behavior is primarily I/O wiring rather than a complex pure transformation. The field projection and `parseInt` conversion are simple enough that example tests provide adequate coverage without the overhead of a generator-based property harness.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: baseFee is the integer parse of last_ledger_base_fee

For any Horizon `feeStats` response where `last_ledger_base_fee` is a string representation of a non-negative integer, the `baseFee` field in the API response body must equal `parseInt(last_ledger_base_fee, 10)` and must be of type `number`.

**Validates: Requirements 1.4**

### Property 2: feeCharged projection selects exactly the specified subset

For any Horizon `feeStats` response, the `feeCharged` object in the API response must contain exactly the keys `min`, `mode`, `p10`, `p50`, `p90`, `p95`, and `p99` — each with the same string value as in the source `fee_charged` object — and must not contain any other keys (e.g. `max`, `p20`, `p30`, `p40`, `p60`, `p70`, `p80`).

**Validates: Requirements 1.3, 1.7**
