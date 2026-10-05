'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Footer.module.css';

const REPO_URL = 'https://github.com/BigNathan1/CoopLumen';

const LINKS = [
  { label: 'Documentation', href: `${REPO_URL}#readme` },
  { label: 'GitHub', href: REPO_URL },
  { label: 'Community', href: `${REPO_URL}/discussions` },
] as const;

const currentYear = new Date().getFullYear();

/**
 * App-wide footer shown on every product page (dashboard, communities,
 * detail views). The landing page renders its own `LandingFooter` with a
 * closing call to action, so this component stays out of the way there to
 * avoid two footers stacking on `/`.
 */
export function Footer() {
  const pathname = usePathname();
  if (pathname === '/') return null;

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <p className={styles.brand}>&copy; {currentYear} CoopLumen</p>
        <nav className={styles.nav} aria-label="Footer">
          {LINKS.map((link) => (
            <a key={link.label} href={link.href} className={styles.link} rel="noreferrer">
              {link.label}
            </a>
          ))}
          <Link href="/" className={styles.link}>
            Home
          </Link>
        </nav>
      </div>
    </footer>
  );
}
