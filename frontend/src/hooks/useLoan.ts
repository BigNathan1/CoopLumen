export { useLoan } from './useLoans';
export type { Loan, LoanDetail, LoanEvent, LoanStatus } from './useLoans';

import { useCallback, useEffect, useState } from 'react';

export interface LoanDetail {
  id: string;
  communityId: string;
  borrowerId: string;
  principal: number;
  remainingBalance: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface UseLoanResult {
  loan: LoanDetail | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useLoan(id: string | null | undefined): UseLoanResult {
  const [loan, setLoan] = useState<LoanDetail | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLoan = useCallback(async () => {
    if (!id) {
      setLoan(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/loans/${encodeURIComponent(id)}`, {
        signal: controller.signal,
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error?.message ?? `Failed to load loan (${response.status})`);
      }
      setLoan(json?.data ?? null);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setLoan(null);
        setError(err instanceof Error ? err.message : 'Failed to load loan');
      }
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchLoan();
  }, [fetchLoan]);

  return { loan, isLoading, error, refetch: fetchLoan };
}
