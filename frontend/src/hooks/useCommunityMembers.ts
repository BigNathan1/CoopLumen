import useSWR, { mutate } from 'swr';
import { useState, useCallback } from 'react';
import { api } from '@/lib/api';
import type { MemberRole } from '@/lib/schemas';
import { fetcher } from '@/lib/swr';

/** A row of `GET /api/v1/communities/:id/members`. */
export interface CommunityMember {
  stellar_address: string;
  role: MemberRole;
  joined_at: string;
}

export interface CommunityMembersFilters {
  /** 1-based page number. Omit to let the API default to page 1. */
  page?: number;
  /** Page size, capped server-side at 100. Omit to use the API default. */
  limit?: number;
  /** Filter to a single role. Omit to return members of every role. */
  role?: MemberRole;
}

export interface AddMemberInput {
  stellarAddress: string;
  role?: MemberRole;
}

function membersPath(communityId: string): string {
  return `/api/v1/communities/${communityId}/members`;
}

/** Revalidates every cached page of a community's member list. */
function revalidateMembers(communityId: string): Promise<unknown> {
  const path = membersPath(communityId);
  return mutate(
    (key) => typeof key === 'string' && (key === path || key.startsWith(`${path}?`)),
    undefined,
    { revalidate: true }
  );
}

/**
 * Paginated member list for a community, oldest-joined first. Pass an empty
 * `communityId` to defer the request (e.g. while a route param is still
 * resolving); SWR treats a `null` key as "don't fetch".
 */
export function useCommunityMembers(communityId: string, filters: CommunityMembersFilters = {}) {
  const params = new URLSearchParams();
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.role) params.set('role', filters.role);

  const query = params.toString();
  const path = communityId ? `${membersPath(communityId)}${query ? `?${query}` : ''}` : null;

  return useSWR<CommunityMember[]>(path, fetcher, { refreshInterval: 60_000 });
}

/**
 * Adds a member via POST /api/v1/communities/:id/members and revalidates the
 * member list.
 */
export function useAddMember(communityId: string) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addMember = useCallback(
    async (input: AddMemberInput): Promise<CommunityMember | null> => {
      setSubmitting(true);
      setError(null);
      try {
        const member = await api.post<CommunityMember>(membersPath(communityId), input);
        await revalidateMembers(communityId);
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
 * Removes a member via DELETE /api/v1/communities/:id/members/:address and
 * revalidates the member list. Members are identified by their Stellar address.
 */
export function useRemoveMember(communityId: string) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const removeMember = useCallback(
    async (stellarAddress: string): Promise<boolean> => {
      setSubmitting(true);
      setError(null);
      try {
        await api.delete(`${membersPath(communityId)}/${stellarAddress}`);
        await revalidateMembers(communityId);
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
