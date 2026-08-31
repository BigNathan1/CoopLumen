import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon?: ReactNode;
  message: string;
  title?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, message, title, action, className }: EmptyStateProps) {
  const classes = ['empty-state', className].filter(Boolean).join(' ');

  return (
    <section className={classes} aria-label={title ?? 'Empty state'}>
      {icon && (
        <div className="empty-state-icon" aria-hidden="true">
          {icon}
        </div>
      )}

      <div className="empty-state-content">
        {title && <h2 className="empty-state-title">{title}</h2>}

        <p className="empty-state-message">{message}</p>

        {action && <div className="empty-state-action">{action}</div>}
      </div>
    </section>
  );
}
