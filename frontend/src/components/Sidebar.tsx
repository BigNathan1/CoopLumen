'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Sidebar.module.css';

export interface SidebarSection {
  /** Path segment appended to `/communities/:id`, e.g. `''` for overview or `'treasury'`. */
  segment: string;
  label: string;
}

const DEFAULT_SECTIONS: SidebarSection[] = [
  { segment: '', label: 'Overview' },
  { segment: 'membership', label: 'Membership' },
  { segment: 'tokens', label: 'Tokens' },
  { segment: 'transactions', label: 'Transactions' },
  { segment: 'treasury', label: 'Treasury' },
];

export interface SidebarProps {
  /** Community whose sub-navigation is being rendered. */
  communityId: string;
  /** Overrides the default set of community sections. */
  sections?: SidebarSection[];
}

/**
 * Community-scoped sub-navigation, rendered alongside a community's detail
 * pages. Each entry links to `/communities/:communityId/:segment` (the empty
 * segment links to the community root) and is marked current from the actual
 * route rather than a passed-in flag, so the active state can never drift out
 * of sync with navigation.
 */
export function Sidebar({ communityId, sections = DEFAULT_SECTIONS }: SidebarProps) {
  const pathname = usePathname();
  const base = `/communities/${communityId}`;

  return (
    <nav className={styles.sidebar} aria-label="Community">
      <ul className={styles.list}>
        {sections.map((section) => {
          const href = section.segment ? `${base}/${section.segment}` : base;
          const isActive = pathname === href;

          return (
            <li key={section.segment}>
              <Link
                href={href}
                className={styles.link}
                aria-current={isActive ? 'page' : undefined}
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
