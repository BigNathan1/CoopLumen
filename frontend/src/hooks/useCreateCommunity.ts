import { useState, useCallback } from 'react';
import { mutate } from 'swr';
import type { Community } from './useCommunities';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface CreateCommunityInput {
  name: string;
  description?: string;
  issuerPublicKey: string;
  assetCode: string;
  assetIssuer: string;
}

/**
 * Creates a community via POST /api/communities and revalidates the SWR
 * communities list cache so the new community appears immediately.
 *
 * Returns the created {@link Community} on success, or `null` when the request
 * fails. The `submitting` flag and `error` string are intended for the calling
 * form to wire up button disabled state and an error message.
 */
export function useCreateCommunity() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createCommunity = useCallback(
    async (input: CreateCommunityInput): Promise<Community | null> => {
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch(`${API_URL}/api/communities`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        const body = (await res.json().catch(() => ({}))) as {
          data?: Community;
          error?: string;
        };
        if (!res.ok) {
          throw new Error(body.error ?? 'Failed to create community');
        }
        // Revalidate all SWR keys that look like the communities list endpoint.
        await mutate(
          (key) => typeof key === 'string' && key.includes('/api/v1/communities'),
          undefined,
          { revalidate: true }
        );
        return body.data ?? null;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create community');
        return null;
      } finally {
        setSubmitting(false);
      }
    },
    []
  );

  return { createCommunity, submitting, error };
}
