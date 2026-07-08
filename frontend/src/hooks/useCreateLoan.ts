import { useState, useCallback } from 'react';
import { mutate } from 'swr';
import type { Loan } from './useLoans';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface CreateLoanInput {
  communityId: string;
  borrowerAddress: string;
  lenderAddress: string;
  amount: string;
  assetCode: string;
  assetIssuer?: string;
  purpose?: string;
  dueAt?: string;
}

/**
 * Creates a loan via POST /api/v1/loans and revalidates every cached loan list
 * so the new (pending) loan shows up immediately. Tracks submitting/error state
 * for the calling form.
 */
export function useCreateLoan() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createLoan = useCallback(async (input: CreateLoanInput): Promise<Loan | null> => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/loans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const body = (await res.json().catch(() => ({}))) as { data?: Loan; error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? 'Failed to create loan');
      }
      await mutate((key) => typeof key === 'string' && key.includes('/api/v1/loans'), undefined, {
        revalidate: true,
      });
      return body.data ?? null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create loan');
      return null;
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { createLoan, submitting, error };
}
