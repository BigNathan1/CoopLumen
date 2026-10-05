import { useCallback, useEffect, useRef, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Connection state of the payments stream. */
export type TransactionsConnectionState =
  | 'idle'
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'closed';

/**
 * A payment record received over the SSE feed. Horizon's payment record is
 * passed through as-is; `id` is always present (synthesised when Horizon omits
 * one) so the list can de-duplicate replayed frames.
 */
export interface StreamedPayment {
  id: string;
  [key: string]: unknown;
}

/** Factory used to build the `EventSource`. Injected in tests. */
export type EventSourceFactory = (url: string) => EventSource;

export interface UseTransactionsOptions {
  /** Stellar account to follow. Passing `null` leaves the feed idle. */
  publicKey: string | null;
  /** Horizon paging token to resume from. Defaults to `now`. */
  cursor?: string;
  /** Maximum number of payments retained in memory. */
  maxItems?: number;
  /** Override for the backend origin. Defaults to `NEXT_PUBLIC_API_URL`. */
  baseUrl?: string;
  /** Override the `EventSource` construction, primarily for tests. */
  eventSourceFactory?: EventSourceFactory;
}

export interface UseTransactionsResult {
  /** Newest-first list of payments received since subscribing. */
  transactions: StreamedPayment[];
  /** The most recent payment, or `null` before the first frame. */
  latestTransaction: StreamedPayment | null;
  /** Connection lifecycle state. */
  status: TransactionsConnectionState;
  /** True once the stream is open and receiving. */
  isConnected: boolean;
  /** The last error reported by the feed, if any. */
  error: Error | null;
  /** Empties the in-memory list without dropping the subscription. */
  clear: () => void;
}

function buildStreamUrl(baseUrl: string, publicKey: string, cursor: string): string {
  const origin = baseUrl.replace(/\/+$/, '');
  const params = new URLSearchParams({ publicKey, cursor });
  return `${origin}/api/v1/stream/payments?${params.toString()}`;
}

/** Parses an SSE `data` payload into a payment, or `null` when malformed. */
function parsePayment(raw: string): StreamedPayment | null {
  let payload: unknown;
  try {
    payload = (JSON.parse(raw) as { data?: unknown }).data;
  } catch {
    return null;
  }

  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  return {
    ...record,
    id: typeof record.id === 'string' ? record.id : JSON.stringify(record),
  };
}

/**
 * Subscribes to `GET /api/v1/stream/payments` for a Stellar account and keeps a
 * newest-first list of the payments it delivers.
 *
 * The `EventSource` handles reconnection itself; this hook only tracks the
 * lifecycle through {@link UseTransactionsResult.status} and surfaces a
 * server-sent `error` frame as {@link UseTransactionsResult.error} without
 * tearing the subscription down. The connection is closed whenever
 * `publicKey`/`cursor` change or the component unmounts.
 *
 * ```tsx
 * const { transactions, isConnected } = useTransactions({ publicKey });
 * ```
 */
export function useTransactions({
  publicKey,
  cursor = 'now',
  maxItems = 50,
  baseUrl = API_URL,
  eventSourceFactory,
}: UseTransactionsOptions): UseTransactionsResult {
  const [transactions, setTransactions] = useState<StreamedPayment[]>([]);
  const [status, setStatus] = useState<TransactionsConnectionState>('idle');
  const [error, setError] = useState<Error | null>(null);

  // Kept in a ref so a caller that re-creates the factory every render does not
  // force the subscription to churn.
  const factoryRef = useRef<EventSourceFactory | undefined>(eventSourceFactory);
  factoryRef.current = eventSourceFactory;

  useEffect(() => {
    if (!publicKey) {
      setStatus('idle');
      setError(null);
      return;
    }

    const factory =
      factoryRef.current ??
      ((url: string) => {
        if (typeof EventSource === 'undefined') {
          throw new Error('EventSource is not available in this environment');
        }
        return new EventSource(url);
      });

    setStatus('connecting');
    setError(null);

    let source: EventSource;
    try {
      source = factory(buildStreamUrl(baseUrl, publicKey, cursor));
    } catch (err) {
      setStatus('closed');
      setError(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    const onPayment = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      const payment = parsePayment(event.data);
      if (!payment) return;

      setTransactions((previous) => {
        if (previous.some((entry) => entry.id === payment.id)) return previous;
        return [payment, ...previous].slice(0, maxItems);
      });
    };

    const onFeedError = (event: Event) => {
      // A server-sent `error` frame carries `data`; a transport failure does not.
      const data = (event as MessageEvent).data;
      if (typeof data === 'string' && data) {
        try {
          const envelope = JSON.parse(data) as { error?: unknown };
          if (typeof envelope.error === 'string') {
            setError(new Error(envelope.error));
          }
        } catch {
          setError(new Error('The payment feed reported a malformed error frame.'));
        }
      }
      // Either way the EventSource will retry on its own, so stay reachable.
      setStatus('reconnecting');
    };

    const onReady = () => {
      setStatus('live');
      setError(null);
    };

    const onOpen = () => setStatus('live');

    source.addEventListener('ready', onReady);
    source.addEventListener('payment', onPayment);
    source.addEventListener('error', onFeedError);
    source.onopen = onOpen;

    return () => {
      source.removeEventListener('ready', onReady);
      source.removeEventListener('payment', onPayment);
      source.removeEventListener('error', onFeedError);
      source.close();
      setStatus('closed');
    };
  }, [publicKey, cursor, maxItems, baseUrl]);

  const clear = useCallback(() => setTransactions([]), []);

  return {
    transactions,
    latestTransaction: transactions[0] ?? null,
    status,
    isConnected: status === 'live',
    error,
    clear,
  };
}
