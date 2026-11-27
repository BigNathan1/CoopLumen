import React from 'react';
import styles from './ReputationScore.module.css';

export interface ReputationScoreProps {
  score: number | null | undefined;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

function getTier(clamped: number): { name: string; className: string } {
  if (clamped >= 80) return { name: 'Excellent', className: styles.excellent };
  if (clamped >= 60) return { name: 'Good', className: styles.good };
  if (clamped >= 40) return { name: 'Fair', className: styles.fair };
  return { name: 'Building', className: styles.building };
}

export const ReputationScore: React.FC<ReputationScoreProps> = ({
  score,
  label = 'Reputation Score',
  size = 'md',
}) => {
  const hasScore = typeof score === 'number' && Number.isFinite(score);
  const clamped = hasScore ? Math.max(0, Math.min(100, Math.round(score))) : 0;
  const tier = getTier(clamped);
  const trackSize = size === 'sm' ? styles.sm : size === 'lg' ? styles.lg : '';

  return (
    <section aria-label={label} className={styles.card}>
      <div className={styles.header}>
        <span className={styles.label}>{label}</span>
        {hasScore ? (
          <span>
            <strong>{clamped}</strong> / 100{' '}
            <span className={`${styles.tier} ${tier.className}`}>({tier.name})</span>
          </span>
        ) : (
          <span className={styles.unrated}>Not yet rated</span>
        )}
      </div>

      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={hasScore ? clamped : undefined}
        aria-valuetext={hasScore ? `${clamped} out of 100 (${tier.name})` : 'Not yet rated'}
        className={`${styles.track} ${trackSize}`.trim()}
      >
        <div className={`${styles.fill} ${tier.className}`} style={{ width: `${clamped}%` }} />
      </div>
    </section>
  );
};
