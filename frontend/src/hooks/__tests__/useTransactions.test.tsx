import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { useTransactions, TransactionLogWithMeta } from '../useTransactions';

// Wrap tests in SWRConfig to clear cache between runs and disable deduping
const wrapper = ({ children }: { children: React.ReactNode }) => (
   new Map(), dedupingInterval: 0 }}>
    {children}
  
);

describe('useTransactions', () => {
  const mockFetch = jest.fn();
  global.fetch = mockFetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('pauses fetching if communityId is empty', () => {
    const { result } = renderHook(() => useTransactions(''), { wrapper });
    
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });

  it('fetches transactions without query parameters when filters are empty', async () => {
    const mockData: TransactionLogWithMeta = {
      data: [
        {
          id: 'tx-1',
          community_id: 'comm-123',
          actor_address: 'GABC...',
          action: 'payment_sent',
          stellar_tx_hash: 'hash...',
          metadata: null,
          created_at: '2026-09-28T12:00:00Z',
        }
      ],
      meta: { total: 1, page: 1, limit: 10, pages: 1, offset: 0 },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    });

    const { result } = renderHook(() => useTransactions('comm-123'), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toEqual(mockData);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/transactions/history/comm-123')
    );
  });

  it('appends query parameters when filters are provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [], meta: {} }),
    });

    const { result } = renderHook(() => useTransactions('comm-123', {
      page: 2,
      limit: 20,
      type: 'token_issued'
    }), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    const fetchCallUrl = mockFetch.mock.calls[0][0];
    expect(fetchCallUrl).toContain('page=2');
    expect(fetchCallUrl).toContain('limit=20');
    expect(fetchCallUrl).toContain('type=token_issued');
  });

  it('handles API errors gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Invalid pagination parameters' }),
    });

    const { result } = renderHook(() => useTransactions('comm-123'), { wrapper });

    await waitFor(() => {
      expect(result.current.error).toBeDefined();
    });

    expect(result.current.error.message).toBe('Invalid pagination parameters');
    expect(result.current.data).toBeUndefined();
  });
});