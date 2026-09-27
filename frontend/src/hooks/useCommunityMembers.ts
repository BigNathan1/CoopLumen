import useSWR from 'swr';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type MemberRole = 'admin' | 'treasurer' | 'member' | 'observer';

export interface CommunityMember {
  stellar_address: string;
  role: MemberRole;
  joined_at: string;
}

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'Failed to fetch community members');
  }
  return (res.json() as Promise<{ data: T }>).then((r) => r.data);
}

export interface CommunityMembersFilters {
  /** 1-based page number. Omit to let the API default to page 1. */
  page?: number;
  /** Page size, capped server-side at 100. Omit to use the API default. */
  limit?: number;
  /** Filter to a single role. Omit to return members of every role. */
  role?: MemberRole;
}

/**
 * Paginated member list for a community, oldest-joined first. Pass an empty
 * `communityId` to defer the request (e.g. while a route param is still
 * resolving) — SWR treats a `null` key as "don't fetch".
 */
export function useCommunityMembers(communityId: string, filters: CommunityMembersFilters = {}) {
  const params = new URLSearchParams();
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.role) params.set('role', filters.role);

  const query = params.toString();
  const url = communityId
    ? `${API_URL}/api/v1/communities/${communityId}/members${query ? `?${query}` : ''}`
    : null;

  return useSWR<CommunityMember[]>(url, fetcher, {
    refreshInterval: 30_000,
  });
}
