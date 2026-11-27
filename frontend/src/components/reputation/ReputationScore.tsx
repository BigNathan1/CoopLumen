import React from 'react';

export interface ReputationScoreProps {
  score: number | null | undefined;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

function getTier(clamped: number): { name: string; colorVar: string } {
  if (clamped >= 80) return { name: 'Excellent', colorVar: 'var(--color-success, #16a34a)' };
  if (clamped >= 60) return { name: 'Good', colorVar: 'var(--color-primary, #2563eb)' };
  if (clamped >= 40) return { name: 'Fair', colorVar: 'var(--color-warning, #d97706)' };
  return { name: 'Building', colorVar: 'var(--color-danger, #dc2626)' };
}

export const ReputationScore: React.FC<ReputationScoreProps> = ({
  score,
  label = 'Reputation Score',
  size = 'md',
}) => {
  const hasScore = typeof score === 'number' && Number.isFinite(score);
  const clamped = hasScore ? Math.max(0, Math.min(100, Math.round(score))) : 0;
  const tier = getTier(clamped);

  const barHeight = size === 'sm' ? '0.375rem' : size === 'lg' ? '0.75rem' : '0.5rem';

  return (
    <section
      aria-label={label}
      style={{
        backgroundColor: 'var(--color-surface, #ffffff)',
        color: 'var(--color-text-primary, #111827)',
        border: '1px solid var(--color-border, #e5e7eb)',
        borderRadius: 'var(--radius-md, 0.5rem)',
        padding: 'var(--space-3, 0.75rem)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: '0.5rem',
        }}
      >
        <span style={{ fontWeight: 600 }}>{label}</span>
        {hasScore ? (
          <span>
            <strong>{clamped}</strong> / 100{' '}
            <span style={{ color: tier.colorVar, fontSize: '0.875rem' }}>({tier.name})</span>
          </span>
        ) : (
          <span style={{ color: 'var(--color-text-secondary, #6b7280)', fontSize: '0.875rem' }}>
            Not yet rated
          </span>
        )}
      </div>

      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={hasScore ? clamped : undefined}
        aria-valuetext={hasScore ? `${clamped} out of 100 (${tier.name})` : 'Not yet rated'}
        style={{
          width: '100%',
          height: barHeight,
          backgroundColor: 'var(--color-surface-muted, #e5e7eb)',
          borderRadius: '9999px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${hasScore ? clamped : 0}%`,
            height: '100%',
            backgroundColor: tier.colorVar,
            transition: 'width 200ms ease',
          }}
        />
      </div>
    </section>
  );
};
