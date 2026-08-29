import { Router, Request, Response, NextFunction } from 'express';
import { StellarService } from '../../contracts/stellar';
import { mapHorizonError } from '../utils/horizonError';

export const feeRouter = Router();

/**
 * GET /api/v1/fees/estimate
 *
 * Returns the current Stellar network base fee and key percentile fee distribution.
 *
 * Fetches live fee statistics from Horizon via StellarService.getFeeStats().
 * Horizon 429/503 errors are retried with exponential backoff (up to 4 attempts)
 * by StellarService before the error is propagated.
 *
 * @route   GET /api/v1/fees/estimate
 * @returns {200} { data: FeeEstimate } - Current fee statistics
 * @returns {502} ErrorResponse - Horizon unavailable after retry exhaustion
 * @see     https://developers.stellar.org/docs/data/horizon/api-reference/aggregations/fee-stats
 */
feeRouter.get('/estimate', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await StellarService.getFeeStats();

    res.json({
      data: {
        baseFee: parseInt(stats.last_ledger_base_fee, 10),
        lastLedger: stats.last_ledger,
        ledgerCapacityUsage: stats.ledger_capacity_usage,
        feeCharged: {
          min: stats.fee_charged.min,
          mode: stats.fee_charged.mode,
          p10: stats.fee_charged.p10,
          p50: stats.fee_charged.p50,
          p90: stats.fee_charged.p90,
          p95: stats.fee_charged.p95,
          p99: stats.fee_charged.p99,
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
