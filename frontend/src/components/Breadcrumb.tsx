'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Breadcrumb.module.css';

/**
 * A single crumb in the trail.
 *
 * `href` is omitted on the last crumb so it renders as plain text rather than
 * a link — the current page is not navigable to itself, and screen readers
 * benefit from the explicit `aria-current="page"` marker.
 */
export interface BreadcrumbItem {
  label: string;
  href?: string;
}

/**
 * Segment-to-label mapping.
 *
 * Used to turn a raw URL segment like `treasury` or `communities` into a
 * human-readable label. Dynamic segments (community IDs, etc.) are not
 * listed here; they fall through to the capitalisation fallback.
 */
const SEGMENT_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  communities: 'Communities',
  membership: 'Membership',
  tokens: 'Tokens',
  transactions: 'Transactions',
  treasury: 'Treasury',
  profile: 'Profile',
  edit: 'Edit',
};

/**
 * Routes where a breadcrumb trail adds no value (the root landing page and the
 * dashboard root, which have no parent context to show).
 */
const EXCLUDED_PATHS = new Set(['/', '/dashboard']);

/**
 * Capitalises the first letter of a string as a last-resort label for unknown
 * segments (e.g. a community ID that happens to be a readable slug).
 */
function toLabel(segment: string): string {
  return SEGMENT_LABELS[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1);
}

/**
 * Derives an ordered breadcrumb trail from a pathname.
 *
 * `/communities/comm-1/treasury` → Home › Communities › comm-1 › Treasury
 *
 * The last item never carries an `href` so it renders as static text with
 * `aria-current="page"`.
 */
export function buildCrumbs(pathname: string): BreadcrumbItem[] {
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) return [];

  const crumbs: BreadcrumbItem[] = [{ label: 'Home', href: '/' }];

  segments.forEach((segment, index) => {
    const href = '/' + segments.slice(0, index + 1).join('/');
    const isLast = index === segments.length - 1;

    crumbs.push({
      label: toLabel(segment),
      href: isLast ? undefined : href,
    });
  });

  return crumbs;
}

export interface BreadcrumbProps {
  /**
   * Overrides the crumbs derived from the current pathname. Use this when the
   * dynamic segment needs a resolved name (e.g. the community's actual name
   * instead of its ID).
   */
  crumbs?: BreadcrumbItem[];
  /** Accessible label for the landmark. Defaults to `"Breadcrumb"`. */
  'aria-label'?: string;
}

/**
 * Route-mirroring breadcrumb navigation.
 *
 * Reads the current pathname from the Next.js App Router and turns it into a
 * sequence of `Home › … › Current page` links. The trail is hidden on pages
 * that have no useful parent context (the landing page and the dashboard root).
 *
 * Accessibility:
 * - Wrapped in `<nav aria-label="Breadcrumb">` so it is a distinct landmark.
 * - Structured as `<ol>` so assistive technologies announce both the item count
 *   and each position within it.
 * - Each intermediate crumb is a plain `<Link>`.
 * - The current page crumb carries `aria-current="page"` and is rendered as
 *   `<span>` rather than `<a>`, matching ARIA Authoring Practices Guide
 *   guidance for breadcrumb trails.
 * - The separators are `aria-hidden` so the reader hears "Home, Communities,
 *   Treasury" rather than "Home › Communities › Treasury".
 *
 * @example
 * // Automatic — reflects the current URL:
 * <Breadcrumb />
 *
 * // Manual — pass resolved names for dynamic segments:
 * <Breadcrumb crumbs={[
 *   { label: 'Home', href: '/' },
 *   { label: 'Communities', href: '/communities' },
 *   { label: community.name },
 * ]} />
 */
export function Breadcrumb({ crumbs: crumbsProp, 'aria-label': ariaLabel = 'Breadcrumb' }: BreadcrumbProps) {
  const pathname = usePathname();

  if (EXCLUDED_PATHS.has(pathname) && !crumbsProp) return null;

  const crumbs = crumbsProp ?? buildCrumbs(pathname);

  if (crumbs.length <= 1) return null;

  return (
    <nav aria-label={ariaLabel} className={styles.nav}>
      <ol className={styles.list}>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;

          return (
            <li key={`${crumb.label}-${index}`} className={styles.item}>
              {!isLast && (
                <>
                  <Link href={crumb.href!} className={styles.link}>
                    {crumb.label}
                  </Link>
                  <span aria-hidden="true" className={styles.separator}>
                    ›
                  </span>
                </>
              )}

              {isLast && (
                <span aria-current="page" className={styles.current}>
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
