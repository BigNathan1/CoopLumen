import { useState, useCallback } from 'react';
import { mutate } from 'swr';
import type { Loan } from './useLoans';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Revalidate every cached loan list and reputation view after a lifecycle change. */
function revalidate(): Promise<unknown> {
  return mutate(
    (key) =>
      typeof key === 'string' &&
      (key.includes('/api/v1/loans') || key.includes('/api/v1/reputation')),
    undefined,
    { revalidate: true }
  );
}

async function send(path: string, method: 'POST' | 'DELETE', body?: unknown): Promise<Loan> {
  const res = await fetch(`${API_URL}/api/v1/loans/${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const parsed = (await res.json().catch(() => ({}))) as { data?: Loan; error?: string };
  if (!res.ok) {
    throw new Error(parsed.error ?? `Request failed (${res.status})`);
  }
  return parsed.data as Loan;
}

/**
 * Loan lifecycle transitions (disburse, repay, default, cancel). Each hits the
 * matching endpoint and revalidates the loan and reputation caches. A single
 * `pending`/`error` pair covers whichever action is in flight for one card.
 */
export function useLoanActions(loanId: string) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (fn: () => Promise<Loan>): Promise<Loan | null> => {
    setPending(true);
    setError(null);
    try {
      const loan = await fn();
      await revalidate();
      return loan;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
      return null;
    } finally {
      setPending(false);
    }
  }, []);

  const disburse = useCallback(
    () => run(() => send(`${loanId}/disburse`, 'POST', {})),
    [loanId, run]
  );
  const repay = useCallback(
    (amount: string) => run(() => send(`${loanId}/repay`, 'POST', { amount })),
    [loanId, run]
  );
  const markDefaulted = useCallback(
    () => run(() => send(`${loanId}/default`, 'POST', {})),
    [loanId, run]
  );
  const cancel = useCallback(() => run(() => send(loanId, 'DELETE')), [loanId, run]);

  return { disburse, repay, markDefaulted, cancel, pending, error };
}
