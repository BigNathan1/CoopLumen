import { useState, useCallback } from 'react';
import { mutate } from 'swr';
import { api } from '@/lib/api';
import type { Community } from './useCommunities';

export interface CreateCommunityInput {
  name: string;
  description?: string;
  issuerPublicKey: string;
  assetCode: string;
  assetIssuer: string;
}

/** Matches every SWR key that looks like the communities list endpoint. */
const isCommunitiesKey = (key: unknown) =>
  typeof key === 'string' && key.includes('/api/v1/communities');

/**
 * Creates a community via POST /api/v1/communities with optimistic updates.
 *
 * The new community is prepended to every cached communities list
 * immediately, then the lists are revalidated: on success that swaps the
 * placeholder for the server's record, on failure it rolls the placeholder
 * back out.
 *
 * Returns the created {@link Community} on success. Failures update `error`
 * and are rethrown so the calling form can preserve field-level API errors.
 */
export function useCreateCommunity() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (input: CreateCommunityInput): Promise<Community> => {
    setLoading(true);
    setError(null);

    const optimisticCommunity: Community = {
      id: `temp-${Date.now()}`,
      name: input.name,
      description: input.description ?? null,
      asset_code: input.assetCode,
      asset_issuer: input.assetIssuer,
      issuer_public_key: input.issuerPublicKey,
      created_at: new Date().toISOString(),
    };

    await mutate(
      isCommunitiesKey,
      (current: Community[] | undefined) =>
        current ? [optimisticCommunity, ...current] : [optimisticCommunity],
      { revalidate: false }
    );

    try {
      return await api.post<Community>('/api/v1/communities', input);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create community';
      setError(message);
      throw err instanceof Error ? err : new Error(message);
    } finally {
      // Confirms the new community on success; rolls the placeholder back on failure.
      await mutate(isCommunitiesKey, undefined, { revalidate: true });
      setLoading(false);
    }
  }, []);

  return { submit, loading, error };
}
