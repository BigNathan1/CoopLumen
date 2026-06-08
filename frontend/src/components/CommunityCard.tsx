'use client';

import type { Community } from '@/hooks/useCommunities';
import styles from './CommunityCard.module.css';

interface Props {
  community: Community;
}

export function CommunityCard({ community }: Props) {
  const joined = new Date(community.created_at).toLocaleDateString();

  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.name}>{community.name}</h3>
        <span className={styles.token}>{community.asset_code}</span>
      </div>
      {community.description && <p className={styles.description}>{community.description}</p>}
      <div className={styles.meta}>
        <span>Issuer: {community.issuer_public_key.slice(0, 8)}…</span>
        <span>Created {joined}</span>
      </div>
    </article>
  );
}
