/**
 * Theme primitives shared by the `useTheme` hook, the pre-paint inline script
 * and any component that needs to reason about the active colour scheme.
 *
 * The DOM contract is deliberately small: `<html>` carries either the `light`
 * or the `dark` class, and `globals.css` swaps the `--color-*` palette from
 * there. Nothing else reads or writes the class.
 */

/** What the user asked for. `system` defers to the OS preference. */
export type Theme = 'light' | 'dark' | 'system';

/** What is actually rendered once `system` has been resolved. */
export type ResolvedTheme = 'light' | 'dark';

export const THEMES: readonly Theme[] = ['light', 'dark', 'system'];

export const RESOLVED_THEMES: readonly ResolvedTheme[] = ['light', 'dark'];

/** localStorage key holding the user's stated preference. */
export const THEME_STORAGE_KEY = 'cooplumen-theme';

export const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

/**
 * The `prefers-color-scheme` media query list, or `null` when it cannot be
 * reached — during SSR, and in older browsers without `matchMedia`.
 */
export function getDarkMediaQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(DARK_MEDIA_QUERY);
}

/** The OS preference, defaulting to light where it cannot be determined. */
export function getSystemTheme(): ResolvedTheme {
  return getDarkMediaQuery()?.matches ? 'dark' : 'light';
}

/**
 * The stored preference, or `null` if none is stored. Storage access throws in
 * private-browsing modes and when cookies are blocked, so failures are treated
 * as "no preference" rather than propagated.
 */
export function readStoredTheme(): Theme | null {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Persists the preference, ignoring storage that refuses to be written to. */
export function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* Preference is still applied for this session; it just will not survive a reload. */
  }
}

export function resolveTheme(theme: Theme, systemTheme: ResolvedTheme): ResolvedTheme {
  return theme === 'system' ? systemTheme : theme;
}

/** Writes the resolved theme onto `<html>`, replacing whichever class is there. */
export function applyTheme(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove(...RESOLVED_THEMES);
  root.classList.add(resolved);
}

/**
 * Script run before first paint so the correct palette is in place on the very
 * first frame. Without it the document renders with the CSS default and then
 * snaps to the stored preference, which is the classic dark-mode flash.
 *
 * It is intentionally dependency-free and wrapped in try/catch: it runs before
 * React and must never be able to break the page.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)});var t=(s==='light'||s==='dark')?s:(window.matchMedia(${JSON.stringify(
  DARK_MEDIA_QUERY
)}).matches?'dark':'light');var e=document.documentElement;e.classList.remove('light','dark');e.classList.add(t);}catch(e){}})();`;
