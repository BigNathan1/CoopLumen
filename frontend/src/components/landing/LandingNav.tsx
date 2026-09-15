'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';
import styles from './LandingNav.module.css';

/** In-page anchors, in the order the sections appear. */
const NAV_LINKS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#cost', label: 'Cost' },
  { href: '#who-its-for', label: "Who it's for" },
  { href: '#developers', label: 'Developers' },
  { href: '#roadmap', label: 'Roadmap' },
] as const;

/**
 * The landing page's sticky header.
 *
 * Two behaviours justify this being a client component: the bar gains a border
 * and a backdrop once the page has scrolled past the hero's first fold, and the
 * links collapse behind a disclosure on narrow screens.
 *
 * The menu closes on Escape and on navigation, and the toggle owns
 * `aria-expanded` / `aria-controls` so the relationship is announced rather
 * than merely visible.
 */
export function LandingNav() {
  const menuId = useId();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  return (
    <header className={styles.header} data-scrolled={scrolled || undefined}>
      <nav className={styles.bar} aria-label="Main">
        <Link href="/" className={styles.brand}>
          <span aria-hidden="true" className={styles.mark}>
            ◆
          </span>
          <span className={styles.wordmark}>CoopLumen</span>
        </Link>

        <ul className={styles.links}>
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <a href={link.href} className={styles.link}>
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className={styles.actions}>
          <ThemeToggle />
          <Link href="/dashboard" className={styles.cta}>
            Open the app
          </Link>
          <button
            type="button"
            className={styles.menuButton}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span
              aria-hidden="true"
              className={styles.menuIcon}
              data-open={menuOpen || undefined}
            />
          </button>
        </div>
      </nav>

      <div id={menuId} className={styles.menu} hidden={!menuOpen}>
        <ul className={styles.menuList}>
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <a href={link.href} className={styles.menuLink} onClick={() => setMenuOpen(false)}>
                {link.label}
              </a>
            </li>
          ))}
          <li>
            <Link href="/dashboard" className={styles.menuLink} onClick={() => setMenuOpen(false)}>
              Open the app
            </Link>
          </li>
        </ul>
      </div>
    </header>
  );
}
