// frontend/src/components/communities/CommunityCard.tsx
'use client';

import Link from 'next/link';
import type { Community } from '@/hooks/useCommunities';
import styles from './CommunityCard.module.css';

// Extending the base Community type to include the new required fields 
// (assuming they use snake_case based on your existing snippet)
interface Props {
  community: Community & {
    id?: string;
    member_count?: number;
    token_count?: number;
    is_joined?: boolean;
  };
  onJoin?: (id: string) => void;
}

export function CommunityCard({ community, onJoin }: Props) {
  // Fix: Renamed from 'joined' to 'createdDate' for semantic clarity
  const createdDate = new Date(community.created_at).toLocaleDateString();
  
  // Fallback to issuer_public_key if your backend doesn't supply a dedicated 'id' yet
  const communityId = community.id || community.issuer_public_key;

  const handleJoinClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault(); // Prevents the card's Link wrapper from routing
    e.stopPropagation();
    if (onJoin) onJoin(communityId);
  };

  return (
    <article className={styles.card}>
      {/* AC: Navigate to community detail page on click (#297) */}
      <Link 
        href={`/communities/${communityId}`} 
        className={styles.linkOverlay}
        aria-label={`View details for ${community.name}`}
      />

      <div className={styles.content}>
        <div className={styles.header}>
          <h3 className={styles.name}>{community.name}</h3>
          <span className={styles.token}>{community.asset_code}</span>
        </div>
        
        {community.description && (
          <p className={styles.description}>{community.description}</p>
        )}
        
        <div className={styles.meta}>
          <span>Issuer: {community.issuer_public_key.slice(0, 8)}…</span>
          <span>Created {createdDate}</span>
        </div>

        {/* AC: Member count and token count (#296) */}
        <div className={styles.metrics}>
          <div className={styles.metric}>
            <span className={styles.metricValue}>{community.member_count ?? 0}</span>
            <span className={styles.metricLabel}> Members</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricValue}>{community.token_count ?? 0}</span>
            <span className={styles.metricLabel}> Tokens</span>
          </div>
        </div>
      </div>

      {/* AC: Join button (#296) */}
      <div className={styles.actions}>
        <button
          onClick={handleJoinClick}
          disabled={community.is_joined}
          className={community.is_joined ? styles.buttonJoined : styles.buttonJoin}
          aria-label={community.is_joined ? `Joined ${community.name}` : `Join ${community.name}`}
        >
          {community.is_joined ? 'Joined' : 'Join Community'}
        </button>
      </div>
    </article>
  );
}