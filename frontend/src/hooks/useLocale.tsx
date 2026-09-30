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
  DEFAULT_LOCALE,
  applyLocale,
  createTranslator,
  getDirection,
  getMessages,
  readStoredLocale,
  storeLocale,
  type Direction,
  type Locale,
  type MessageCatalog,
  type MessageVars,
} from '@/lib/i18n';

interface LocaleContextValue {
  /** The active locale. */
  locale: Locale;
  /** `ltr` or `rtl`, derived from the locale. */
  direction: Direction;
  /** The full catalog for the active locale. */
  messages: MessageCatalog;
  /** Switch locale, persisting the choice. */
  setLocale: (locale: Locale) => void;
  /** Translate a dot-separated key with optional `{placeholder}` values. */
  t: (key: string, vars?: MessageVars) => string;
}

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

/**
 * Owns the active locale and mirrors it onto `<html>` as `lang` and `dir`.
 *
 * Must wrap the app (see `app/layout.tsx`) alongside the pre-paint
 * `LOCALE_INIT_SCRIPT`, which restores the stored locale before React runs so
 * an RTL visitor never sees a left-to-right flash.
 */
export function LocaleProvider({
  children,
  defaultLocale = DEFAULT_LOCALE,
}: {
  children: ReactNode;
  defaultLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);

  /*
   * `localStorage` does not exist while rendering on the server. It is read
   * after mount so the first client render matches the server markup.
   */
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readStoredLocale();
    if (stored) setLocaleState(stored);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) applyLocale(locale);
  }, [hydrated, locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    storeLocale(next);
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      direction: getDirection(locale),
      messages: getMessages(locale),
      setLocale,
      t: createTranslator(locale),
    }),
    [locale, setLocale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/** Reads the active locale. Throws when used outside `LocaleProvider`. */
export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return context;
}

/** Convenience hook for components that only need the translator. */
export function useTranslation(): {
  t: LocaleContextValue['t'];
  locale: Locale;
  direction: Direction;
} {
  const { t, locale, direction } = useLocale();
  return { t, locale, direction };
}
