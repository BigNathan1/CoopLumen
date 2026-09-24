import useSWR from 'swr';
import { requestRaw } from '../lib/api';

export type MultiSigAction =
  | 'payment'
  | 'token_issue'
  | 'trustline'
  | 'settings_update'
  | 'member_role_change'
  | 'signer_update';

export type MultiSigStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'expired'
  | 'cancelled';

export interface MultiSigSignerStatus {
  address: string;
  role?: string;
  signed: boolean;
  signed_at?: string | null;
}

export interface MultiSigRequest {
  id: string;
  community_id: string;
  proposer_address: string;
  action: MultiSigAction;
  title: string;
  description: string | null;
  payload: Record<string, unknown>;
  transaction_xdr: string | null;
  required_signatures: number;
  current_signatures: number;
  status: MultiSigStatus;
  stellar_tx_hash: string | null;
  rejection_reason: string | null;
  expires_at: string | null;
  executed_at: string | null;
  created_at: string;
  updated_at: string;
  signers?: MultiSigSignerStatus[];
}

export interface MultiSigFilters {
  status?: MultiSigStatus;
  page?: number;
  limit?: number;
}

export interface CreateMultiSigInput {
  action: MultiSigAction;
  title: string;
  description?: string;
  payload?: Record<string, unknown>;
  transaction_xdr?: string;
  required_signatures?: number;
  proposer_address: string;
  expires_at?: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'Failed to fetch multisig requests');
  }
  const envelope = (await res.json()) as { data: T };
  return envelope.data;
}

/**
 * Custom hook to manage multi-sig proposal requests for a community.
 */
export function useMultiSig(communityId?: string | null, filters: MultiSigFilters = {}) {
  const query = new URLSearchParams();
  if (filters.status) query.set('status', filters.status);
  if (filters.page) query.set('page', String(filters.page));
  if (filters.limit) query.set('limit', String(filters.limit));

  const queryString = query.toString() ? `?${query.toString()}` : '';
  const url = communityId
    ? `${API_URL}/api/v1/multisig/community/${communityId}${queryString}`
    : null;

  const { data, error, isLoading, mutate } = useSWR<MultiSigRequest[]>(url, fetcher, {
    refreshInterval: 15_000,
  });

  const createRequest = async (input: CreateMultiSigInput): Promise<MultiSigRequest> => {
    if (!communityId) throw new Error('Community ID is required to create a multisig request');
    const res = await requestRaw<MultiSigRequest>('POST', `/api/v1/multisig/community/${communityId}`, {
      body: input,
    });
    await mutate();
    return res.data;
  };

  const approveRequest = async (id: string, signedXdr?: string): Promise<MultiSigRequest> => {
    const res = await requestRaw<MultiSigRequest>('POST', `/api/v1/multisig/requests/${id}/approve`, {
      body: { signed_xdr: signedXdr },
    });
    await mutate();
    return res.data;
  };

  const rejectRequest = async (id: string, reason?: string): Promise<MultiSigRequest> => {
    const res = await requestRaw<MultiSigRequest>('POST', `/api/v1/multisig/requests/${id}/reject`, {
      body: { reason },
    });
    await mutate();
    return res.data;
  };

  const executeRequest = async (id: string, stellarTxHash: string): Promise<MultiSigRequest> => {
    const res = await requestRaw<MultiSigRequest>('POST', `/api/v1/multisig/requests/${id}/execute`, {
      body: { stellar_tx_hash: stellarTxHash },
    });
    await mutate();
    return res.data;
  };

  return {
    requests: data ?? [],
    isLoading,
    error,
    mutate,
    createRequest,
    approveRequest,
    rejectRequest,
    executeRequest,
  };
}
