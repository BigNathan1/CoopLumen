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
 * Creates a community via POST /api/v1/communities with optimistic updates.
 * Appends the new community to cached lists immediately, then confirms or rolls back.
 */
export function useCreateCommunity() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createCommunity = useCallback(
    async (input: CreateCommunityInput): Promise<Community | null> => {
      setSubmitting(true);
      setError(null);

      // Build optimistic community with a temporary ID
      const optimisticCommunity: Community = {
        id: `temp-${Date.now()}`,
        name: input.name,
        description: input.description ?? null,
        asset_code: input.assetCode,
        asset_issuer: input.assetIssuer,
        issuer_public_key: input.issuerPublicKey,
        created_at: new Date().toISOString(),
      };

      // Optimistically update all community list caches
      await mutate(
        (key) => typeof key === 'string' && key.includes('/api/v1/communities'),
        (current: Community[] | undefined) =>
          current ? [optimisticCommunity, ...current] : [optimisticCommunity],
        { revalidate: false }
      );

      try {
        const res = await fetch(`${API_URL}/api/v1/communities`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        const body = (await res.json().catch(() => ({}))) as { data?: Community; error?: string };
        if (!res.ok) {
          throw new Error(body.error ?? 'Failed to create community');
        }
        // Revalidate to replace optimistic entry with server response
        await mutate(
          (key) => typeof key === 'string' && key.includes('/api/v1/communities'),
          undefined,
          { revalidate: true }
        );
        return body.data ?? null;
      } catch (err) {
        // Rollback optimistic update on error
        await mutate(
          (key) => typeof key === 'string' && key.includes('/api/v1/communities'),
          undefined,
          { revalidate: true }
        );
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