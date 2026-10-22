import {
  THEMES,
  RESOLVED_THEMES,
  THEME_STORAGE_KEY,
  DARK_MEDIA_QUERY,
  isTheme,
  getDarkMediaQuery,
  getSystemTheme,
  readStoredTheme,
  storeTheme,
  resolveTheme,
  applyTheme,
  THEME_INIT_SCRIPT,
} from '@/lib/theme';

describe('theme', () => {
  describe('constants', () => {
    it('defines all theme options', () => {
      expect(THEMES).toEqual(['light', 'dark', 'system']);
    });

    it('defines resolved theme options', () => {
      expect(RESOLVED_THEMES).toEqual(['light', 'dark']);
    });

    it('uses a consistent storage key', () => {
      expect(THEME_STORAGE_KEY).toBe('cooplumen-theme');
    });

    it('uses the standard dark mode media query', () => {
      expect(DARK_MEDIA_QUERY).toBe('(prefers-color-scheme: dark)');
    });
  });

  describe('isTheme', () => {
    it('returns true for valid theme values', () => {
      expect(isTheme('light')).toBe(true);
      expect(isTheme('dark')).toBe(true);
      expect(isTheme('system')).toBe(true);
    });

    it('returns false for invalid theme values', () => {
      expect(isTheme('invalid')).toBe(false);
      expect(isTheme('')).toBe(false);
      expect(isTheme(null)).toBe(false);
      expect(isTheme(undefined)).toBe(false);
      expect(isTheme(123)).toBe(false);
      expect(isTheme({})).toBe(false);
    });
  });

  describe('getDarkMediaQuery', () => {
    const originalMatchMedia = window.matchMedia;

    afterEach(() => {
      window.matchMedia = originalMatchMedia;
    });

    it('returns a MediaQueryList when matchMedia is available', () => {
      const mockMQL = { matches: false } as MediaQueryList;
      window.matchMedia = jest.fn(() => mockMQL);

      const result = getDarkMediaQuery();

      expect(result).toBe(mockMQL);
      expect(window.matchMedia).toHaveBeenCalledWith(DARK_MEDIA_QUERY);
    });

    it('returns null when matchMedia is not available', () => {
      // @ts-expect-error - intentionally testing undefined case
      window.matchMedia = undefined;

      const result = getDarkMediaQuery();

      expect(result).toBeNull();
    });
  });

  describe('getSystemTheme', () => {
    const originalMatchMedia = window.matchMedia;

    afterEach(() => {
      window.matchMedia = originalMatchMedia;
    });

    it('returns "dark" when the OS prefers dark mode', () => {
      const mockMQL = { matches: true } as MediaQueryList;
      window.matchMedia = jest.fn(() => mockMQL);

      expect(getSystemTheme()).toBe('dark');
    });

    it('returns "light" when the OS prefers light mode', () => {
      const mockMQL = { matches: false } as MediaQueryList;
      window.matchMedia = jest.fn(() => mockMQL);

      expect(getSystemTheme()).toBe('light');
    });

    it('defaults to "light" when matchMedia is unavailable', () => {
      // @ts-expect-error - intentionally testing undefined case
      window.matchMedia = undefined;

      expect(getSystemTheme()).toBe('light');
    });
  });

  describe('readStoredTheme', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it('returns the stored theme when it exists and is valid', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'dark');
      expect(readStoredTheme()).toBe('dark');
    });

    it('returns null when no theme is stored', () => {
      expect(readStoredTheme()).toBeNull();
    });

    it('returns null when the stored value is not a valid theme', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'invalid');
      expect(readStoredTheme()).toBeNull();
    });

    it('returns null when localStorage throws an error', () => {
      const originalGetItem = Storage.prototype.getItem;
      Storage.prototype.getItem = jest.fn(() => {
        throw new Error('localStorage access denied');
      });

      expect(readStoredTheme()).toBeNull();

      Storage.prototype.getItem = originalGetItem;
    });
  });

  describe('storeTheme', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it('stores the theme in localStorage', () => {
      storeTheme('dark');
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    });

    it('overwrites an existing stored theme', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'light');
      storeTheme('dark');
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    });

    it('does not throw when localStorage is unavailable', () => {
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = jest.fn(() => {
        throw new Error('localStorage access denied');
      });

      expect(() => storeTheme('dark')).not.toThrow();

      Storage.prototype.setItem = originalSetItem;
    });
  });

  describe('resolveTheme', () => {
    it('returns "light" when theme is "light"', () => {
      expect(resolveTheme('light', 'dark')).toBe('light');
    });

    it('returns "dark" when theme is "dark"', () => {
      expect(resolveTheme('dark', 'light')).toBe('dark');
    });

    it('returns the system theme when theme is "system"', () => {
      expect(resolveTheme('system', 'dark')).toBe('dark');
      expect(resolveTheme('system', 'light')).toBe('light');
    });
  });

  describe('applyTheme', () => {
    beforeEach(() => {
      document.documentElement.className = '';
    });

    it('adds the resolved theme class to the document root', () => {
      applyTheme('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('removes the other theme class when applying a theme', () => {
      document.documentElement.classList.add('light');
      applyTheme('dark');
      expect(document.documentElement.classList.contains('light')).toBe(false);
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('switches between themes cleanly', () => {
      applyTheme('light');
      expect(document.documentElement.classList.contains('light')).toBe(true);
      expect(document.documentElement.classList.contains('dark')).toBe(false);

      applyTheme('dark');
      expect(document.documentElement.classList.contains('light')).toBe(false);
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('preserves other classes on the document root', () => {
      document.documentElement.classList.add('some-other-class');
      applyTheme('dark');
      expect(document.documentElement.classList.contains('some-other-class')).toBe(true);
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });

  describe('THEME_INIT_SCRIPT', () => {
    it('is a valid JavaScript IIFE', () => {
      expect(() => {
        new Function(THEME_INIT_SCRIPT);
      }).not.toThrow();
    });

    it('contains the storage key', () => {
      expect(THEME_INIT_SCRIPT).toContain(THEME_STORAGE_KEY);
    });

    it('contains the dark media query', () => {
      expect(THEME_INIT_SCRIPT).toContain(DARK_MEDIA_QUERY);
    });

    it('wraps everything in a try-catch', () => {
      expect(THEME_INIT_SCRIPT).toContain('try{');
      expect(THEME_INIT_SCRIPT).toContain('}catch(');
    });

    it('is self-contained with no external dependencies', () => {
      // Should not reference any external variables
      expect(THEME_INIT_SCRIPT).not.toContain('require(');
      expect(THEME_INIT_SCRIPT).not.toContain('import ');
    });

    it('manipulates classList.remove and classList.add', () => {
      expect(THEME_INIT_SCRIPT).toContain('classList.remove');
      expect(THEME_INIT_SCRIPT).toContain('classList.add');
    });
  });
});
