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
import { act, renderHook } from '@testing-library/react';
import { useTransactions, type EventSourceFactory } from '../useTransactions';

type Listener = (event: unknown) => void;

/**
 * Minimal stand-in for the browser `EventSource`. Records every instance and
 * lets a test drive open/payment/error frames the way the server would.
 */
class FakeEventSource {
  static instances: FakeEventSource[] = [];

  readonly url: string;
  closed = false;
  onopen: (() => void) | null = null;
  private listeners = new Map<string, Set<Listener>>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)?.add(listener);
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }

  close() {
    this.closed = true;
  }

  countListeners(type: string) {
    return this.listeners.get(type)?.size ?? 0;
  }

  open() {
    this.onopen?.();
  }

  emit(type: string, event: unknown) {
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }

  emitPayment(record: Record<string, unknown>) {
    this.emit('payment', { data: JSON.stringify({ data: record }) });
  }
}

const factory: EventSourceFactory = (url) => new FakeEventSource(url) as unknown as EventSource;

function lastSource(): FakeEventSource {
  return FakeEventSource.instances[FakeEventSource.instances.length - 1];
}

beforeEach(() => {
  FakeEventSource.instances = [];
});

describe('useTransactions', () => {
  it('stays idle until a public key is available', () => {
    const { result } = renderHook(() =>
      useTransactions({ publicKey: null, eventSourceFactory: factory })
    );

    expect(FakeEventSource.instances).toHaveLength(0);
    expect(result.current.status).toBe('idle');
    expect(result.current.transactions).toEqual([]);
  });

  it('subscribes to the payments stream for the public key', () => {
    const publicKey = `G${'A'.repeat(55)}`;
    renderHook(() => useTransactions({ publicKey, cursor: '123', eventSourceFactory: factory }));

    expect(FakeEventSource.instances).toHaveLength(1);
    const url = new URL(lastSource().url);
    expect(url.pathname).toBe('/api/v1/stream/payments');
    expect(url.searchParams.get('publicKey')).toBe(publicKey);
    expect(url.searchParams.get('cursor')).toBe('123');
  });

  it('reports a live connection when the stream opens', () => {
    const { result } = renderHook(() =>
      useTransactions({ publicKey: `G${'A'.repeat(55)}`, eventSourceFactory: factory })
    );

    expect(result.current.status).toBe('connecting');

    act(() => lastSource().open());

    expect(result.current.status).toBe('live');
    expect(result.current.isConnected).toBe(true);
  });

  it('collects payments newest-first and exposes the latest one', () => {
    const { result } = renderHook(() =>
      useTransactions({ publicKey: `G${'A'.repeat(55)}`, eventSourceFactory: factory })
    );

    act(() => {
      lastSource().emitPayment({ id: 'op-1', amount: '1.0000000' });
      lastSource().emitPayment({ id: 'op-2', amount: '2.0000000' });
    });

    expect(result.current.transactions.map((t) => t.id)).toEqual(['op-2', 'op-1']);
    expect(result.current.latestTransaction).toMatchObject({ id: 'op-2', amount: '2.0000000' });
  });

  it('ignores a replayed frame with an id it already holds', () => {
    const { result } = renderHook(() =>
      useTransactions({ publicKey: `G${'A'.repeat(55)}`, eventSourceFactory: factory })
    );

    act(() => {
      lastSource().emitPayment({ id: 'op-1' });
      lastSource().emitPayment({ id: 'op-1' });
    });

    expect(result.current.transactions).toHaveLength(1);
  });

  it('drops malformed frames without disturbing the list', () => {
    const { result } = renderHook(() =>
      useTransactions({ publicKey: `G${'A'.repeat(55)}`, eventSourceFactory: factory })
    );

    act(() => {
      lastSource().emit('payment', { data: 'not json' });
      lastSource().emit('payment', { data: JSON.stringify({ data: null }) });
    });

    expect(result.current.transactions).toEqual([]);
  });

  it('caps the retained list at maxItems', () => {
    const { result } = renderHook(() =>
      useTransactions({
        publicKey: `G${'A'.repeat(55)}`,
        maxItems: 2,
        eventSourceFactory: factory,
      })
    );

    act(() => {
      lastSource().emitPayment({ id: 'op-1' });
      lastSource().emitPayment({ id: 'op-2' });
      lastSource().emitPayment({ id: 'op-3' });
    });

    expect(result.current.transactions.map((t) => t.id)).toEqual(['op-3', 'op-2']);
  });

  it('surfaces a server-sent error frame and stays subscribed', () => {
    const { result } = renderHook(() =>
      useTransactions({ publicKey: `G${'A'.repeat(55)}`, eventSourceFactory: factory })
    );

    act(() => {
      lastSource().emit('error', {
        data: JSON.stringify({ data: null, error: 'Horizon unavailable' }),
      });
    });

    expect(result.current.error?.message).toBe('Horizon unavailable');
    expect(result.current.status).toBe('reconnecting');
    expect(lastSource().closed).toBe(false);
  });

  it('treats a transport failure as reconnecting', () => {
    const { result } = renderHook(() =>
      useTransactions({ publicKey: `G${'A'.repeat(55)}`, eventSourceFactory: factory })
    );

    act(() => lastSource().open());
    act(() => lastSource().emit('error', {}));

    expect(result.current.status).toBe('reconnecting');
  });

  it('clears the list without dropping the subscription', () => {
    const { result } = renderHook(() =>
      useTransactions({ publicKey: `G${'A'.repeat(55)}`, eventSourceFactory: factory })
    );

    act(() => lastSource().emitPayment({ id: 'op-1' }));
    act(() => result.current.clear());

    expect(result.current.transactions).toEqual([]);
    expect(lastSource().closed).toBe(false);
  });

  it('closes the connection on unmount', () => {
    const { unmount } = renderHook(() =>
      useTransactions({ publicKey: `G${'A'.repeat(55)}`, eventSourceFactory: factory })
    );

    const source = lastSource();
    unmount();

    expect(source.closed).toBe(true);
    expect(source.countListeners('payment')).toBe(0);
  });

  it('re-subscribes when the public key changes and closes the old stream', () => {
    const { rerender } = renderHook(
      ({ publicKey }: { publicKey: string }) =>
        useTransactions({ publicKey, eventSourceFactory: factory }),
      { initialProps: { publicKey: `G${'A'.repeat(55)}` } }
    );

    const first = lastSource();

    rerender({ publicKey: `G${'B'.repeat(55)}` });

    expect(FakeEventSource.instances).toHaveLength(2);
    expect(first.closed).toBe(true);
    expect(lastSource()).not.toBe(first);
  });
});
