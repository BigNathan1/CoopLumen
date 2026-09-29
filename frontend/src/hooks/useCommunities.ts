import useSWR, { mutate } from 'swr';
import { useState, useCallback } from 'react';
import type { MemberRole } from '@/lib/schemas';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.json()) as { error?: string };
    throw new Error(body.error ?? 'Request failed');
  }
  return (res.json() as Promise<{ data: T }>).then((r) => r.data);
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
  const url = query ? `${API_URL}/api/v1/communities?${query}` : `${API_URL}/api/v1/communities`;

  return useSWR<Community[]>(url, fetcher, {
    refreshInterval: 30_000,
  });
}

/**
 * A single community by id. Pass an empty string to defer the request (e.g.
 * while a route param is still resolving) — SWR treats a `null` key as "don't
 * fetch".
 */
export function useCommunity(id: string) {
  return useSWR<Community>(id ? `${API_URL}/api/v1/communities/${id}` : null, fetcher);
}

export function useCommunityMembers(communityId: string) {
  return useSWR<CommunityMember[]>(
    communityId ? `${API_URL}/api/communities/${communityId}/members` : null,
    fetcher,
    { refreshInterval: 60_000 }
  );
}

// ── Member mutation hooks ─────────────────────────────────────────────────────

export interface AddMemberInput {
  stellarAddress: string;
  role?: MemberRole;
}

/**
 * Adds a member to a community via POST /api/communities/:id/members and
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
        const res = await fetch(`${API_URL}/api/communities/${communityId}/members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        const body = (await res.json().catch(() => ({}))) as {
          data?: CommunityMember;
          error?: string;
        };
        if (!res.ok) {
          throw new Error(body.error ?? 'Failed to add member');
        }
        await mutate(`${API_URL}/api/communities/${communityId}/members`);
        return body.data ?? null;
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
 * Removes a member from a community via DELETE /api/communities/:id/members/:memberId
 * and revalidates the member list cache.
 */
export function useRemoveMember(communityId: string) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const removeMember = useCallback(
    async (memberId: string): Promise<boolean> => {
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch(`${API_URL}/api/communities/${communityId}/members/${memberId}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? 'Failed to remove member');
        }
        await mutate(`${API_URL}/api/communities/${communityId}/members`);
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
