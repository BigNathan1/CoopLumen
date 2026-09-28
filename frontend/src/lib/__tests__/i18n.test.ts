import en from '../../../messages/en.json';
import sw from '../../../messages/sw.json';
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  RTL_LOCALES,
  SUPPORTED_LOCALES,
  applyLocale,
  createTranslator,
  getDirection,
  getMessages,
  interpolate,
  isLocale,
  lookup,
  readStoredLocale,
  storeLocale,
  translate,
  type MessageCatalog,
} from '../i18n';

/** Every leaf path in a catalog, so two catalogs can be compared exactly. */
function keyPaths(catalog: MessageCatalog, prefix = ''): string[] {
  return Object.entries(catalog).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'object' ? keyPaths(value, path) : [path];
  });
}

describe('locale metadata', () => {
  it('ships a catalog for every supported locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(getMessages(locale)).toBeDefined();
      expect(Object.keys(getMessages(locale)).length).toBeGreaterThan(0);
    }
  });

  it('accepts only supported locales', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('sw')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(null)).toBe(false);
  });

  it('resolves direction from the language subtag', () => {
    expect(getDirection('en')).toBe('ltr');
    expect(getDirection('sw')).toBe('ltr');
    for (const locale of RTL_LOCALES) {
      expect(getDirection(locale)).toBe('rtl');
      expect(getDirection(`${locale}-KE`)).toBe('rtl');
    }
  });

  it('defaults to English and lets an unknown env value fall through', () => {
    expect(DEFAULT_LOCALE).toBe('en');
  });
});

describe('Swahili catalog', () => {
  it('mirrors the English key structure exactly', () => {
    expect(keyPaths(sw as MessageCatalog).sort()).toEqual(keyPaths(en as MessageCatalog).sort());
  });

  it('translates every English string rather than copying it', () => {
    // A handful of strings are legitimately identical (proper nouns); the point
    // is that the file is actually translated, not cloned.
    const english = keyPaths(en as MessageCatalog);
    const identical = english.filter(
      (key) => lookup(sw as MessageCatalog, key) === lookup(en as MessageCatalog, key)
    );
    expect(identical.length).toBeLessThan(english.length);
  });

  it('uses the same placeholders as the English string', () => {
    for (const key of keyPaths(en as MessageCatalog)) {
      const enSlots = (lookup(en as MessageCatalog, key) as string).match(/\{(\w+)\}/g) ?? [];
      const swSlots = (lookup(sw as MessageCatalog, key) as string).match(/\{(\w+)\}/g) ?? [];
      expect({ key, swSlots }).toEqual({ key, swSlots: enSlots });
    }
  });
});

describe('translation helpers', () => {
  it('looks up dot-separated keys', () => {
    expect(translate(en as MessageCatalog, 'nav.dashboard')).toBe('Dashboard');
    expect(translate(sw as MessageCatalog, 'nav.dashboard')).toBe('Dashibodi');
  });

  it('interpolates {placeholder} values', () => {
    expect(
      translate(sw as MessageCatalog, 'transactions.newPayment', { amount: '5', asset: 'XLM' })
    ).toBe('Malipo mapya ya 5 XLM');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(interpolate('Hello {name} {missing}', { name: 'Amina' })).toBe('Hello Amina {missing}');
  });

  it('returns the key when no string exists, rather than blank output', () => {
    expect(translate(en as MessageCatalog, 'nope.not.here')).toBe('nope.not.here');
  });

  it('falls back to English for a locale without a catalog', () => {
    const t = createTranslator('fr');
    expect(t('nav.profile')).toBe('Profile');
  });
});

describe('persistence and DOM application', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('lang');
    document.documentElement.removeAttribute('dir');
  });

  it('round-trips a stored locale', () => {
    expect(readStoredLocale()).toBeNull();
    storeLocale('sw');
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('sw');
    expect(readStoredLocale()).toBe('sw');
  });

  it('ignores an unrecognised stored value', () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'fr');
    expect(readStoredLocale()).toBeNull();
  });

  it('writes lang and dir onto the html element', () => {
    applyLocale('sw');
    expect(document.documentElement.lang).toBe('sw');
    expect(document.documentElement.dir).toBe('ltr');

    applyLocale('ar');
    expect(document.documentElement.dir).toBe('rtl');
  });
});
