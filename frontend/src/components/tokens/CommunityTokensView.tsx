'use client';

import Link from 'next/link';
import { useCommunity } from '@/hooks/useCommunities';
import { TokenManagement } from './TokenManagement';
import styles from './CommunityTokensView.module.css';

interface Props {
  communityId: string;
}

export function CommunityTokensView({ communityId }: Props) {
  const { data: community, error, isLoading } = useCommunity(communityId);

  return (
    <div className={styles.layout}>
      <Link href={`/communities/${communityId}`} className={styles.back}>
        ← Back to community
      </Link>

      <div className={styles.header}>
        <h1 className={styles.title}>
          {isLoading ? 'Loading…' : (community?.name ?? 'Tokens')}
        </h1>
        <p className={styles.subtitle}>Tokens issued for this community.</p>
      </div>

      {error && (
        <div className={styles.communityError} role="alert">
          Could not load this community.
        </div>
      )}

      <TokenManagement communityId={communityId} />
    </div>
  );
}
