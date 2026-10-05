import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { estimateFee, useEstimateFee, type FeeStats } from '../useEstimateFee';

const STATS: FeeStats = {
  baseFee: 100,
  lastLedger: '123456',
  ledgerCapacityUsage: '0.42',
  feeCharged: {
    min: '100',
    mode: '100',
    p10: '100',
    p50: '250',
    p90: '1000',
    p95: '2000',
    p99: '5000',
  },
};

const fetchMock = jest.fn();

beforeAll(() => {
  (global as { fetch?: unknown }).fetch = fetchMock;
});

afterEach(() => {
  fetchMock.mockReset();
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
);

describe('estimateFee', () => {
  it('multiplies the median per-operation fee by the operation count', () => {
    expect(estimateFee(STATS, 3)).toBe('750');
  });

  it('never estimates below the base fee', () => {
    const quiet = { ...STATS, feeCharged: { ...STATS.feeCharged, p50: '50' } };
    expect(estimateFee(quiet, 2)).toBe('200');
  });
});

describe('useEstimateFee', () => {
  it('does not fetch when operations are undefined', () => {
    const { result } = renderHook(() => useEstimateFee(), { wrapper });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.estimatedFee).toBeNull();
  });

  it('does not fetch when the operations array is empty', () => {
    const { result } = renderHook(() => useEstimateFee([]), { wrapper });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.estimatedFee).toBeNull();
  });

  it('reads the fee stats and estimates the fee for the given operations', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data: STATS }) });

    const operations = [{ type: 'payment' }, { type: 'payment' }];
    const { result } = renderHook(() => useEstimateFee(operations), { wrapper });

    await waitFor(() => expect(result.current.estimatedFee).toBe('500'));
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4000/api/v1/fees/estimate');
  });

  it('surfaces API errors', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Horizon unavailable' }),
    });

    const { result } = renderHook(() => useEstimateFee([{ type: 'payment' }]), { wrapper });

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.error?.message).toBe('Horizon unavailable');
    expect(result.current.estimatedFee).toBeNull();
  });
});
