import { useState, useCallback } from 'react';
import { mutate } from 'swr';
import { api } from '@/lib/api';
import type { Loan } from './useLoans';

export interface CreateLoanInput {
  communityId: string;
  borrowerAddress: string;
  lenderAddress: string;
  amount: string;
  assetCode: string;
  assetIssuer?: string;
  purpose?: string;
  dueAt?: string;
  interestRate?: number;
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
      const loan = await api.post<Loan>('/api/v1/loans', input);
      await mutate((key) => typeof key === 'string' && key.includes('/api/v1/loans'), undefined, {
        revalidate: true,
      });
      return loan ?? null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create loan');
      return null;
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { createLoan, submitting, error };
}
