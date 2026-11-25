export type CommunityLoanFilters = Omit<LoanFilters, 'communityId'>;

export function useLoans(
  communityId: string | null,
  filters?: CommunityLoanFilters,
): ReturnType<typeof useSWR<Loan[]>>;
export function useLoans(filters?: LoanFilters): ReturnType<typeof useSWR<Loan[]>>;
export function useLoans(
  communityIdOrFilters?: string | null | LoanFilters,
  maybeFilters?: CommunityLoanFilters,
) {
  // Explicit null or empty string when using (communityId, filters) defers the fetch
  if (communityIdOrFilters === null || communityIdOrFilters === '') {
    return useSWR<Loan[]>(null, fetcher);
  }

  const filters: LoanFilters =
    typeof communityIdOrFilters === 'string'
      ? { ...maybeFilters, communityId: communityIdOrFilters }
      : (communityIdOrFilters ?? {});

  const params = new URLSearchParams({ limit: String(filters.limit ?? 10) });
  if (filters.communityId) params.set('communityId', filters.communityId);
  if (filters.borrower) params.set('borrower', filters.borrower);
  if (filters.lender) params.set('lender', filters.lender);
  if (filters.status) params.set('status', filters.status);

  return useSWR<Loan[]>(`/api/v1/loans?${params.toString()}`, fetcher);
}