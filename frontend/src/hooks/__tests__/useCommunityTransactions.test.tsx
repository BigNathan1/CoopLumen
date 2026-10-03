import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { api, ApiError } from '@/lib/api';
import {
  mapTransactionLogRow,
  useCommunityTransactions,
  type TransactionLogRow,
} from '../useCommunityTransactions';

function row(overrides: Partial<TransactionLogRow> = {}): TransactionLogRow {
  return {
    id: 'log-1',
    community_id: 'community-1',
    actor_address: 'G' + 'A'.repeat(55),
    action: 'payment_sent',
    stellar_tx_hash: 'c'.repeat(64),
    metadata: { amount: '25.5000000', asset_code: 'SOLR' },
    created_at: '2026-03-04T09:30:00.000Z',
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
  );
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('mapTransactionLogRow', () => {
  it('maps an on-chain row to a confirmed transaction with amount and asset', () => {
    expect(mapTransactionLogRow(row())).toEqual({
      id: 'log-1',
      hash: 'c'.repeat(64),
      type: 'payment_sent',
      amount: '25.5000000',
      assetCode: 'SOLR',
      date: '2026-03-04T09:30:00.000Z',
      status: 'confirmed',
    });
  });

  it('marks a row without a Stellar hash as recorded', () => {
    const mapped = mapTransactionLogRow(row({ stellar_tx_hash: null, action: 'loan_created' }));

    expect(mapped.hash).toBeNull();
    expect(mapped.status).toBe('recorded');
  });

  it('accepts numeric amounts in metadata', () => {
    expect(mapTransactionLogRow(row({ metadata: { amount: 12 } })).amount).toBe('12');
  });

  it.each([[null], [undefined], ['text'], [42], [{}], [{ amount: '' }], [{ amount: null }]])(
    'returns no amount for metadata %j',
    (metadata) => {
      const mapped = mapTransactionLogRow(row({ metadata }));

      expect(mapped.amount).toBeNull();
      expect(mapped.assetCode).toBeNull();
    }
  );
});

describe('useCommunityTransactions', () => {
  it('requests the community history page and maps rows and pagination meta', async () => {
    const raw = jest.spyOn(api, 'raw').mockResolvedValue({
      data: [row(), row({ id: 'log-2', stellar_tx_hash: null, metadata: null })],
      meta: { total: 45, page: 2, limit: 20, pages: 3, offset: 20 },
    });

    const { result } = renderHook(() => useCommunityTransactions('community-1', 2), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(raw).toHaveBeenCalledWith('GET', '/api/v1/transactions/history/community-1', {
      query: { page: 2, limit: 20 },
      auth: false,
    });
    expect(result.current.data?.items.map((i) => i.status)).toEqual(['confirmed', 'recorded']);
    expect(result.current.data?.meta).toEqual({ total: 45, page: 2, limit: 20, pages: 3 });
  });

  it('encodes the community id in the request path', async () => {
    const raw = jest.spyOn(api, 'raw').mockResolvedValue({ data: [], meta: {} });

    renderHook(() => useCommunityTransactions('a/b c'), { wrapper });

    await waitFor(() => expect(raw).toHaveBeenCalled());
    expect(raw.mock.calls[0][1]).toBe('/api/v1/transactions/history/a%2Fb%20c');
  });

  it('falls back to sensible meta when the response has none', async () => {
    jest.spyOn(api, 'raw').mockResolvedValue({ data: [row()] });

    const { result } = renderHook(() => useCommunityTransactions('community-1'), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.meta).toEqual({ total: 1, page: 1, limit: 20, pages: 1 });
  });

  it('does not fetch without a community id', () => {
    const raw = jest.spyOn(api, 'raw');

    const { result } = renderHook(() => useCommunityTransactions(''), { wrapper });

    expect(raw).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });

  it('surfaces API errors', async () => {
    jest.spyOn(api, 'raw').mockRejectedValue(new ApiError('Community not found', { status: 404 }));

    const { result } = renderHook(() => useCommunityTransactions('missing'), { wrapper });

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.error?.message).toBe('Community not found');
  });
});
