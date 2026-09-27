import useSWR from 'swr';
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

export function useCommunities() {
  return useSWR<Community[]>(`${API_URL}/api/v1/communities`, fetcher, {
    refreshInterval: 30_000,
  });
}

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
