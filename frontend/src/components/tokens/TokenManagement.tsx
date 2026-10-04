'use client';

import { useCommunityTokens } from '@/hooks/useTokens';
import { TokenCard } from './TokenCard';
import { EmptyState } from '@/components/ui/EmptyState';
import styles from './TokenManagement.module.css';

interface Props {
  communityId: string;
}

export function TokenManagement({ communityId }: Props) {
  const { data: tokens, error, isLoading } = useCommunityTokens(communityId);

  if (isLoading) {
    return (
      <div className={styles.state} role="status" aria-live="polite">
        Loading tokens…
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${styles.state} ${styles.error}`} role="alert">
        Could not load tokens for this community.
      </div>
    );
  }

  if (!tokens?.length) {
    return <EmptyState title="No tokens yet" message="This community has not issued any tokens." />;
  }

  return (
    <div className={styles.grid}>
      {tokens.map((token) => (
        <TokenCard key={token.id} token={token} />
      ))}
    </div>
  );
}
