import useSWR from 'swr';
import { fetcher } from './SWRProvider';

/** Response of `GET /api/v1/fees/estimate`; fee values are stroops per operation. */
export interface FeeStats {
  baseFee: number;
  lastLedger: string;
  ledgerCapacityUsage: string;
  feeCharged: {
    min: string;
    mode: string;
    p10: string;
    p50: string;
    p90: string;
    p95: string;
    p99: string;
  };
}

/**
 * Estimated total fee, in stroops, for a transaction with `operationCount`
 * operations: the median per-operation fee recently charged on the network,
 * never less than the base fee.
 */
export function estimateFee(stats: FeeStats, operationCount: number): string {
  const perOperation = Math.max(stats.baseFee, Number(stats.feeCharged.p50) || 0);
  return String(perOperation * operationCount);
}

/**
 * Estimated fee for a transaction built from `operations`, shown before
 * signing so users are not surprised by a rejection on a busy network.
 *
 * The request is skipped until there is at least one operation. Fee stats are
 * shared across every caller and refreshed at most every 5 seconds.
 *
 * @example
 * ```tsx
 * const { estimatedFee } = useEstimateFee([{ type: 'payment', amount: '100' }]);
 * ```
 */
export function useEstimateFee(operations?: unknown[]) {
  const operationCount = operations?.length ?? 0;

  const { data, error, isLoading, isValidating } = useSWR<FeeStats, Error>(
    operationCount > 0 ? '/api/v1/fees/estimate' : null,
    fetcher,
    { keepPreviousData: true, dedupingInterval: 5000 }
  );

  return {
    estimatedFee: data && operationCount > 0 ? estimateFee(data, operationCount) : null,
    isLoading,
    isValidating,
    error,
  };
}
