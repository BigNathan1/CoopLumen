/**
 * Internationalisation primitives shared by the `useLocale` hook, the root
 * layout and any component that needs to reason about the active locale.
 *
 * The DOM contract mirrors `lib/theme.ts`: `<html>` carries `lang` and `dir`
 * attributes, and `globals.css` reads direction from `html[dir="rtl"]`. Nothing
 * else writes those attributes.
 *
 * Catalogs are plain JSON under `frontend/messages/<locale>.json` so adding a
 * language is a matter of dropping in a file and registering it in
 * {@link CATALOGS} — no build step or third-party dependency.
 */

import en from '../../messages/en.json';
import sw from '../../messages/sw.json';

/** A leaf translation. */
export type MessageValue = string;

/** A nested group of translations. */
export interface MessageCatalog {
  [key: string]: MessageValue | MessageCatalog;
}

/** Text direction a locale is written in. */
export type Direction = 'ltr' | 'rtl';

/** Locales the app ships translations for. */
export const SUPPORTED_LOCALES = ['en', 'sw'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Locales that render right-to-left. Kept separate from
 * {@link SUPPORTED_LOCALES} so Arabic and Hebrew can be enabled by adding a
 * catalog without also having to teach the layout what RTL means.
 */
export const RTL_LOCALES = ['ar', 'he', 'fa', 'ur'] as const;

/** Fallback locale, and the one every catalog is expected to mirror. */
export const DEFAULT_LOCALE: Locale = 'en';

/** localStorage key holding the user's chosen locale. */
export const LOCALE_STORAGE_KEY = 'cooplumen-locale';

const CATALOGS: Partial<Record<string, MessageCatalog>> = {
  en: en as MessageCatalog,
  sw: sw as MessageCatalog,
};

/** True when `value` is a locale the app has a catalog for. */
export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * The text direction for a locale. `ar`/`he`/etc. resolve to `rtl` even before a
 * catalog exists, so a layout can be exercised against RTL without new strings.
 */
export function getDirection(locale: string): Direction {
  const base = locale.toLowerCase().split('-')[0];
  return (RTL_LOCALES as readonly string[]).includes(base) ? 'rtl' : 'ltr';
}

/** The catalog for a locale, falling back to English when one is missing. */
export function getMessages(locale: string): MessageCatalog {
  return CATALOGS[locale] ?? CATALOGS[DEFAULT_LOCALE] ?? {};
}

/**
 * The locale to render before the client has had a chance to read storage.
 * Read from `NEXT_PUBLIC_DEFAULT_LOCALE` so a self-hosting operator can ship a
 * non-English default; anything unrecognised falls back to English.
 */
export function getDefaultLocale(): Locale {
  const configured = process.env.NEXT_PUBLIC_DEFAULT_LOCALE;
  return isLocale(configured) ? configured : DEFAULT_LOCALE;
}

/**
 * Resolves a dot-separated key against a catalog. Returns `undefined` rather
 * than throwing so a missing string degrades to the key instead of crashing a
 * render.
 */
export function lookup(catalog: MessageCatalog, key: string): MessageValue | undefined {
  const value = key.split('.').reduce<MessageValue | MessageCatalog | undefined>((node, part) => {
    if (node && typeof node === 'object') return node[part];
    return undefined;
  }, catalog);

  return typeof value === 'string' ? value : undefined;
}

/** Values substituted into `{placeholder}` slots. */
export type MessageVars = Record<string, string | number>;

/** Replaces `{name}` slots with their values, leaving unknown slots untouched. */
export function interpolate(template: string, vars?: MessageVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  );
}

/**
 * Translates `key` against a catalog. The key itself is returned when no string
 * is found, which makes a missing translation visible instead of blank.
 */
export function translate(catalog: MessageCatalog, key: string, vars?: MessageVars): string {
  const template = lookup(catalog, key);
  return template === undefined ? key : interpolate(template, vars);
}

/** Binds a locale so components get a `t(key, vars)` function. */
export function createTranslator(locale: string): (key: string, vars?: MessageVars) => string {
  const catalog = getMessages(locale);
  return (key, vars) => translate(catalog, key, vars);
}

/** Reads the stored locale, or `null` when none is stored. */
export function readStoredLocale(): Locale | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Persists the locale, ignoring storage that refuses to be written to. */
export function storeLocale(locale: Locale): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* Applied for this session; it just will not survive a reload. */
  }
}

/** Writes `lang` and `dir` onto `<html>`. */
export function applyLocale(locale: string): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.lang = locale;
  root.dir = getDirection(locale);
}

/**
 * Pre-paint script that restores the stored locale to `<html>` before React
 * runs. Without it an RTL visitor sees the page lay out left-to-right and then
 * snap, and a screen reader may announce the wrong language.
 *
 * Dependency-free and wrapped in try/catch: it runs before React and must never
 * be able to break the page.
 */
export const LOCALE_INIT_SCRIPT = `(function(){try{var rtl=${JSON.stringify(
  RTL_LOCALES as unknown as string[]
)};var e=document.documentElement;var s=localStorage.getItem(${JSON.stringify(
  LOCALE_STORAGE_KEY
)});if(s){e.lang=s;}var base=(s||e.lang||'en').toLowerCase().split('-')[0];e.dir=rtl.indexOf(base)>=0?'rtl':'ltr';}catch(e){}})();`;
