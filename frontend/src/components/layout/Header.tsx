'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useMinWidth } from '@/hooks/useBreakpoint';
import { WalletConnect } from '@/components/wallet/WalletConnect';
import { ThemeToggle } from './ThemeToggle';
import styles from './Header.module.css';

export interface HeaderNavLink {
  href: string;
  label: string;
}

const DEFAULT_LINKS: HeaderNavLink[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/communities', label: 'Communities' },
];

export interface HeaderProps {
  /** Overrides the default primary navigation links. */
  links?: HeaderNavLink[];
}

/**
 * Site-wide navigation: brand, primary links, theme toggle and the wallet
 * connect control.
 *
 * Below the `md` breakpoint the links collapse behind a hamburger toggle so
 * the bar stays a single row on narrow viewports; at `md` and above the links
 * render inline and the toggle is not rendered at all, so no hidden button
 * lingers in the tab order.
 */
export function Header({ links = DEFAULT_LINKS }: HeaderProps) {
  const pathname = usePathname();
  const isDesktop = useMinWidth('md');
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className={styles.header}>
      <div className={styles.bar}>
        <Link href="/" className={styles.brand} onClick={closeMenu}>
          <span aria-hidden="true" className={styles.logo}>
            ◆
          </span>
          <span className={styles.wordmark}>CoopLumen</span>
        </Link>

        {isDesktop && (
          <nav className={styles.nav} aria-label="Primary">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={styles.navLink}
                aria-current={pathname === link.href ? 'page' : undefined}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        )}

        <div className={styles.actions}>
          <ThemeToggle />
          {isDesktop && <WalletConnect />}
          {!isDesktop && (
            <button
              type="button"
              className={styles.menuButton}
              aria-expanded={menuOpen}
              aria-controls="header-mobile-menu"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className={styles.hamburgerIcon} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </button>
          )}
        </div>
      </div>

      {!isDesktop && menuOpen && (
        <div id="header-mobile-menu" className={styles.mobileMenu}>
          <nav aria-label="Primary" className={styles.mobileNav}>
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={styles.navLink}
                aria-current={pathname === link.href ? 'page' : undefined}
                onClick={closeMenu}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className={styles.mobileWallet}>
            <WalletConnect />
          </div>
        </div>
      )}
    </header>
  );
}
