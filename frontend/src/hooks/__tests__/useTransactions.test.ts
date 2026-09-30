import { renderHook } from '@testing-library/react';
import { useTransactionHistory } from '../useTransactions';
import type { TransactionLogEntry, PageMeta } from '../useTransactions';

const ENTRY: TransactionLogEntry = {
  id: 'tx-1',
  community_id: 'comm-1',
  actor_address: 'G' + 'A'.repeat(55),
  action: 'payment_sent',
  stellar_tx_hash: 'a'.repeat(64),
  metadata: { amount: '10.0000000' },
  created_at: '2026-01-01T00:00:00.000Z',
};

const META: PageMeta = { total: 1, page: 1, limit: 20, pages: 1, offset: 0 };

jest.mock('swr', () => ({
  __esModule: true,
  default: (key: string | null) => {
    if (!key) {
      return { data: undefined, error: undefined, isLoading: false, mutate: jest.fn() };
    }
    return {
      data: { data: [ENTRY], meta: META },
      error: undefined,
      isLoading: false,
      mutate: jest.fn(),
    };
  },
}));

describe('useTransactionHistory', () => {
  it('does not fetch when communityId is null', () => {
    const { result } = renderHook(() => useTransactionHistory(null));
    expect(result.current.data).toBeUndefined();
    expect(result.current.meta).toBeUndefined();
  });

  it('returns entries and pagination meta for a community', () => {
    const { result } = renderHook(() => useTransactionHistory('comm-1'));
    expect(result.current.data).toEqual([ENTRY]);
    expect(result.current.meta).toEqual(META);
  });
});
