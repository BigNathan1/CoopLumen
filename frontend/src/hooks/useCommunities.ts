import useSWR, { mutate } from 'swr';
import { fetcher } from './SWRProvider';
import { useState, useCallback } from 'react';
import { api } from '@/lib/api';
import type { MemberRole } from '@/lib/schemas';

export interface Community {
  id: string;
  name: string;
  description: string | null;
  asset_code: string;
  asset_issuer: string;
  issuer_public_key: string;
  created_at: string;
}

export interface CommunityMember {
  id: string;
  community_id: string;
  stellar_address: string;
  role: MemberRole;
  joined_at: string;
}

export interface CommunitiesFilters {
  /** 1-based page number. Omit to let the API default to page 1. */
  page?: number;
  /** Page size, capped server-side at 100. Omit to use the API default. */
  limit?: number;
  /** Full-text search over community name and description. */
  search?: string;
}

/** Paginated, optionally-searched list of communities, newest first. */
export function useCommunities(filters: CommunitiesFilters = {}) {
  const params = new URLSearchParams();
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.search) params.set('search', filters.search);

  const query = params.toString();
  const path = query ? `/api/v1/communities?${query}` : '/api/v1/communities';

  return useSWR<Community[]>(path, fetcher);
}

/**
 * A single community by id. Pass an empty string to defer the request (e.g.
 * while a route param is still resolving) — SWR treats a `null` key as "don't
 * fetch".
 */
export function useCommunity(id: string) {
  return useSWR<Community>(id ? `/api/v1/communities/${id}` : null, fetcher);
}

export function useCommunityMembers(communityId: string) {
  return useSWR<CommunityMember[]>(
    communityId ? `/api/v1/communities/${communityId}/members` : null,
    fetcher,
    { refreshInterval: 60_000 }
  );
}

// Member mutation hooks

export interface AddMemberInput {
  stellarAddress: string;
  role?: MemberRole;
}

/**
 * Adds a member to a community via POST /api/v1/communities/:id/members and
 * revalidates the member list cache.
 */
export function useAddMember(communityId: string) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addMember = useCallback(
    async (input: AddMemberInput): Promise<CommunityMember | null> => {
      setSubmitting(true);
      setError(null);
      try {
        const member = await api.post<CommunityMember>(
          `/api/v1/communities/${communityId}/members`,
          input
        );
        await mutate(`/api/v1/communities/${communityId}/members`);
        return member;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add member');
        return null;
      } finally {
        setSubmitting(false);
      }
    },
    [communityId]
  );

  return { addMember, submitting, error };
}

/**
 * Removes a member from a community via
 * DELETE /api/v1/communities/:id/members/:address and revalidates the member
 * list cache. Members are identified by their Stellar address.
 */
export function useRemoveMember(communityId: string) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const removeMember = useCallback(
    async (stellarAddress: string): Promise<boolean> => {
      setSubmitting(true);
      setError(null);
      try {
        await api.delete(`/api/v1/communities/${communityId}/members/${stellarAddress}`);
        await mutate(`/api/v1/communities/${communityId}/members`);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove member');
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [communityId]
  );

  return { removeMember, submitting, error };
}
