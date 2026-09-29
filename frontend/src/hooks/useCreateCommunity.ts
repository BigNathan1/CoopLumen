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

/**
 * Creates a community via POST /api/v1/communities and revalidates the SWR
 * communities list cache so the new community appears immediately.
 *
 * Returns the created {@link Community} on success, or `null` when the request
 * fails. The `loading` flag and `error` string are intended for the calling
 * form to wire up button disabled state and an error message.
 */
export function useCreateCommunity() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (input: CreateCommunityInput): Promise<Community | null> => {
      setLoading(true);
      setError(null);
      try {
        const community = await api.post<Community>('/api/v1/communities', input);
        // Revalidate all SWR keys that look like the communities list endpoint.
        await mutate(
          (key) => typeof key === 'string' && key.includes('/api/v1/communities'),
          undefined,
          { revalidate: true }
        );
        return community;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create community');
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { submit, loading, error };
}
