'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import {
  applyTheme,
  getDarkMediaQuery,
  getSystemTheme,
  readStoredTheme,
  resolveTheme,
  storeTheme,
  type ResolvedTheme,
  type Theme,
} from '@/lib/theme';

interface ThemeContextValue {
  /** The stated preference, including `system`. */
  theme: Theme;
  /** The theme actually rendered, with `system` resolved against the OS. */
  resolvedTheme: ResolvedTheme;
  /** The current OS preference, regardless of what the user chose. */
  systemTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  /** Flips to the opposite of what is currently rendered, as an explicit choice. */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/**
 * Owns the colour-scheme preference: reads it from storage, keeps it in sync
 * with the OS while it is set to `system`, and mirrors the result onto
 * `<html>` for `globals.css` to pick up.
 *
 * Must wrap the app (see `app/layout.tsx`) alongside the pre-paint
 * `THEME_INIT_SCRIPT`, which puts the same class on `<html>` before React runs
 * so there is no flash of the wrong palette.
 */
export function ThemeProvider({
  children,
  defaultTheme = 'system',
}: {
  children: ReactNode;
  defaultTheme?: Theme;
}) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>('light');

  /*
   * `localStorage` and `matchMedia` do not exist while rendering on the server,
   * so both are read after mount. Seeding state from them directly would make
   * the first client render disagree with the server markup and trip a
   * hydration error.
   */
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readStoredTheme();
    if (stored) setThemeState(stored);
    setSystemTheme(getSystemTheme());
    setHydrated(true);
  }, []);

  // Keep `system` live: following the OS means reacting when it changes.
  useEffect(() => {
    const query = getDarkMediaQuery();
    if (!query) return;

    const onChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light');
    };

    // Safari below 14 only implements the deprecated listener API.
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    }

    query.addListener(onChange);
    return () => query.removeListener(onChange);
  }, []);

  const resolvedTheme = resolveTheme(theme, systemTheme);

  /*
   * Held back until the stored preference has been read, so the class the
   * pre-paint script already set is not briefly overwritten with the default.
   */
  useEffect(() => {
    if (hydrated) applyTheme(resolvedTheme);
  }, [hydrated, resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    storeTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  }, [resolvedTheme, setTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, systemTheme, setTheme, toggleTheme }),
    [theme, resolvedTheme, systemTheme, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Reads the active theme. Throws when used outside `ThemeProvider`. */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
