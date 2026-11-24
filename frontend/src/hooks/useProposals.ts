import useSWR from 'swr';
import { api } from '../lib/api';
import type { Proposal, ProposalStatus } from './useProposal';

export type { Proposal, ProposalStatus };

export interface UseProposalsResult {
  data: Proposal[] | undefined;
  error: unknown;
  isLoading: boolean;
  refresh: () => void;
}

/**
 * Fetches the list of proposals for a community, optionally filtered by status.
 *
 * The request is skipped when `communityId` is empty (null, undefined, or an
 * empty string), in which case `data` is `undefined` and `isLoading` is `false`.
 */
export function useProposals(
  communityId: string | null | undefined,
  status?: ProposalStatus,
): UseProposalsResult {
  const hasCommunityId =
    typeof communityId === 'string' && communityId.trim().length > 0;

  let path: string | null = null;
  if (hasCommunityId) {
    const params = new URLSearchParams();
    params.set('communityId', communityId as string);
    if (status) {
      params.set('status', status);
    }
    path = `/api/v1/proposals?${params.toString()}`;
  }

  const { data, error, isLoading, mutate } = useSWR<Proposal[]>(
    path,
    (url: string) => api.get<Proposal[]>(url, { auth: false }),
  );

  return {
    data,
    error,
    isLoading: hasCommunityId ? isLoading : false,
    refresh: () => {
      void mutate();
    },
  };
}

export default useProposals;