'use client';

import { SUPPORTED_LOCALES, type Locale } from '@/lib/i18n';
import { useLocale } from '@/hooks/useLocale';
import styles from './LocaleSwitcher.module.css';

/**
 * Language names are written in their own language (endonyms) and are
 * deliberately not translated: "Kiswahili" is what a Swahili speaker looks for
 * in the list, whether the UI is currently English or Swahili.
 */
const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  sw: 'Kiswahili',
};

export interface LocaleSwitcherProps {
  className?: string;
}

/**
 * Picks the active UI language.
 *
 * The visible text stays compact (a globe glyph beside the endonym of the
 * current locale) because the header it lives in is tight; the accessible name
 * comes from `common.language` so assistive technology announces what the
 * control does in the user's own language.
 */
export function LocaleSwitcher({ className }: LocaleSwitcherProps) {
  const { locale, setLocale, t } = useLocale();
  const label = t('common.language');

  return (
    <div className={[styles.wrapper, className].filter(Boolean).join(' ')}>
      <span aria-hidden="true" className={styles.icon}>
        🌐
      </span>
      <select
        className={styles.select}
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        aria-label={label}
        title={label}
      >
        {SUPPORTED_LOCALES.map((option) => (
          <option key={option} value={option}>
            {LOCALE_LABELS[option]}
          </option>
        ))}
      </select>
    </div>
  );
}
