'use client';

import { useTheme } from '@/hooks/useTheme';
import styles from './ThemeToggle.module.css';

/** Shown while the light palette is active: pressing it moves to dark. */
function MoonIcon() {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  );
}

/** Shown while the dark palette is active: pressing it moves to light. */
function SunIcon() {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

export interface ThemeToggleProps {
  /** Renders the target theme beside the icon. Off by default to keep the header compact. */
  showLabel?: boolean;
  className?: string;
}

/**
 * Switches between the light and dark palettes.
 *
 * The button reports the theme it will move to rather than the one in force,
 * because that is the outcome of pressing it — the current theme is already
 * visible. `aria-pressed` still carries the state for assistive technology,
 * and a polite live region confirms the switch for users who cannot see it.
 */
export function ThemeToggle({ showLabel = false, className }: ThemeToggleProps) {
  const { resolvedTheme, toggleTheme } = useTheme();

  const isDark = resolvedTheme === 'dark';
  const nextTheme = isDark ? 'light' : 'dark';
  const label = `Switch to ${nextTheme} theme`;

  return (
    <>
      <button
        type="button"
        className={[styles.toggle, className].filter(Boolean).join(' ')}
        onClick={toggleTheme}
        aria-label={label}
        aria-pressed={isDark}
        title={label}
      >
        {isDark ? <SunIcon /> : <MoonIcon />}
        {showLabel && <span className={styles.label}>{nextTheme}</span>}
      </button>

      <span role="status" aria-live="polite" className={styles.announcement}>
        {isDark ? 'Dark theme' : 'Light theme'}
      </span>
    </>
  );
}
