import useSWR from 'swr';
import { fetcher } from './SWRProvider';

export interface Community {
  id: string;
  name: string;
  description: string | null;
  asset_code: string;
  asset_issuer: string;
  issuer_public_key: string;
  created_at: string;
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