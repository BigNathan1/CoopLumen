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
