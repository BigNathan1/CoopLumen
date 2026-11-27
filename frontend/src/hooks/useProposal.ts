import useSWR from 'swr';
import { api, ApiError } from '@/lib/api';

export type ProposalType =
  | 'general'
  | 'loan_approval'
  | 'member_removal'
  | 'treasury_spend'
  | 'settings_change'
  | 'token_issuance';

export type ProposalStatus = 'draft' | 'active' | 'passed' | 'rejected' | 'executed' | 'cancelled';

/** Proposal metadata and the latest aggregate ballot weights. */
export interface Proposal {
  id: string;
  community_id: string;
  proposer_address: string;
  title: string;
  description: string | null;
  type: ProposalType;
  status: ProposalStatus;
  quorum_percent: string;
  metadata: Record<string, unknown> | null;
  voting_starts_at: string;
  voting_ends_at: string;
  executed_at: string | null;
  stellar_tx_hash: string | null;
  created_at: string;
  updated_at: string;
  votes_for: string;
  votes_against: string;
  votes_abstain: string;
  total_weight: string;
}

/** Aggregate ballot weights for a proposal, as returned by the detail endpoint. */
export interface Tally {
  for: string;
  against: string;
  abstain: string;
  totalWeight: string;
}

/** Proposal detail payload: metadata plus the current vote tally. */
export interface ProposalDetail extends Proposal {
  tally: Tally;
}

/** Envelope returned by `GET /api/v1/proposals/:id`. */
interface ProposalDetailEnvelope {
  data: { proposal: Proposal; tally: Tally };
}

/** How often an open proposal's tally is refreshed from the backend. */
export const PROPOSAL_REFRESH_MS = 5_000;

/**
 * Reads one proposal and keeps its vote tally current while the view is open.
 * Pass an empty or null id to defer the request until route data is available.
 *
 * The detail endpoint wraps the payload in a `{ data }` envelope; the envelope
 * is unwrapped here so consumers receive a `ProposalDetail` directly. Failures
 * surface as `ApiError` via SWR's `error` for the component's error state.
 */
export function useProposal(id: string | null | undefined) {
  const path = id ? `/api/v1/proposals/${encodeURIComponent(id)}` : null;

  return useSWR<ProposalDetail, ApiError>(
    path,
    async () => {
      const response = await api.get<ProposalDetailEnvelope>(path as string, { auth: false });
      return { ...response.data.proposal, tally: response.data.tally };
    },
    {
      refreshInterval: PROPOSAL_REFRESH_MS,
      keepPreviousData: true,
      refreshWhenHidden: false,
      revalidateOnFocus: true,
    }
  );
}
