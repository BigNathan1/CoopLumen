import type { HTMLAttributes, ReactNode } from 'react';

export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: AlertVariant;
  title?: string;
}

const icons: Record<AlertVariant, ReactNode> = {
  info: (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  ),
  success: (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  ),
  warning: (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M10.3 3.3 2.2 17a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  ),
  error: (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  ),
};

export function Alert({ children, variant = 'info', title, className, ...props }: AlertProps) {
  const classes = ['alert', `alert-${variant}`, className].filter(Boolean).join(' ');

  const role = variant === 'error' ? 'alert' : 'status';

  return (
    <div className={classes} role={role} {...props}>
      <span className="alert-icon">{icons[variant]}</span>

      <div className="alert-content">
        {title && <p className="alert-title">{title}</p>}
        <div className="alert-message">{children}</div>
      </div>
    </div>
  );
}
