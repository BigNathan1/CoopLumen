'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, isApiError } from '@/lib/api';
import type { UpdateCommunityInput } from '@/lib/schemas';
import { EditCommunityForm, type EditableCommunity } from '@/components/EditCommunityForm';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { WalletConnect } from '@/components/wallet/WalletConnect';
import styles from './page.module.css';

interface EditCommunityPageClientProps {
  communityId: string;
}

function communityFromResponse(value: unknown): EditableCommunity | null {
  if (typeof value !== 'object' || value === null) return null;
  const response = value as Record<string, unknown>;
  const candidate =
    typeof response.community === 'object' && response.community !== null
      ? (response.community as Record<string, unknown>)
      : response;

  if (typeof candidate.name !== 'string') return null;
  return candidate as EditableCommunity;
}

function messageFromError(error: unknown, fallback: string): string {
  if (isApiError(error)) return error.message;
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Client boundary for the dynamic edit route. Keeping the fetch in the browser
 * lets the typed API client attach the Freighter session token after the user
 * connects their wallet, while the route module below remains a normal App
 * Router server entry with metadata.
 */
export function EditCommunityPageClient({
  communityId,
}: EditCommunityPageClientProps): React.JSX.Element {
  const router = useRouter();
  const [community, setCommunity] = useState<EditableCommunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCommunity = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .get<unknown>(`/api/v1/communities/${encodeURIComponent(communityId)}`)
      .then((payload) => {
        if (cancelled) return;
        const next = communityFromResponse(payload);
        if (!next) {
          setError('Community not found.');
          return;
        }
        setCommunity(next);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(messageFromError(requestError, 'Unable to load this community.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [communityId]);

  useEffect(() => loadCommunity(), [loadCommunity]);

  const handleSave = async (values: UpdateCommunityInput): Promise<unknown> => {
    const updated = await api.put<unknown>(
      `/api/v1/communities/${encodeURIComponent(communityId)}`,
      values
    );
    return updated;
  };

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.topbar}>
          <div>
            <Link href="/dashboard" className={styles.backLink}>
              ← Back to dashboard
            </Link>
            <h1 className={styles.title}>Edit community</h1>
            <p className={styles.subtitle}>Update the profile members see across CoopLumen.</p>
          </div>
          <WalletConnect />
        </div>

        {loading && (
          <div className={styles.loading}>
            <LoadingSkeleton variant="text" count={5} label="Loading community" />
          </div>
        )}

        {!loading && error && (
          <Alert variant="error" title="Unable to edit community">
            <p>{error}</p>
            <Button type="button" variant="secondary" size="sm" onClick={loadCommunity}>
              Retry
            </Button>
          </Alert>
        )}

        {!loading && !error && community && (
          <EditCommunityForm
            community={community}
            onSubmit={handleSave}
            onCancel={() => router.back()}
          />
        )}
      </div>
    </main>
  );
}

export default EditCommunityPageClient;
