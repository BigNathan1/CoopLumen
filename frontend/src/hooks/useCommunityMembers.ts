import useSWR from 'swr';
import { fetcher } from './SWRProvider';

export type MemberRole = 'admin' | 'treasurer' | 'member' | 'observer';

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
  const path = communityId
    ? `/api/v1/communities/${communityId}/members${query ? `?${query}` : ''}`
    : null;

  return useSWR<CommunityMember[]>(path, fetcher);
}
