'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import styles from './ProtectedRoute.module.css';

export interface ProtectedRouteProps {
  /** Content rendered when the user is authenticated */
  children: ReactNode;
  /** Optional custom fallback rendered while checking authentication or redirecting */
  fallback?: ReactNode;
  /** Path to redirect unauthenticated callers to (defaults to '/') */
  redirectTo?: string;
}

/**
 * Route protection wrapper component.
 *
 * Checks current session state using {@link useAuth}. If authentication is
 * still initializing or loading, renders an accessible shimmer skeleton.
 * If unauthenticated, navigates the user to home (or `redirectTo`) via
 * `router.replace` without adding an unwanted history entry.
 * Once verified as authenticated, renders `children`.
 */
export function ProtectedRoute({ children, fallback, redirectTo = '/' }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(redirectTo);
    }
  }, [isLoading, isAuthenticated, redirectTo, router]);

  if (isLoading) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return (
      <div className={styles.loadingContainer} data-testid="protected-route-loading">
        <LoadingSkeleton
          variant="text"
          count={3}
          gap={12}
          label="Authenticating session, please wait…"
        />
      </div>
    );
  }

  if (!isAuthenticated) {
    return fallback ? <>{fallback}</> : null;
  }

  return <>{children}</>;
}
