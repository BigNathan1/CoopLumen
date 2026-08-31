import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, useTheme } from '../useTheme';
import { THEME_INIT_SCRIPT, THEME_STORAGE_KEY, isTheme, resolveTheme } from '@/lib/theme';

type MediaListener = (event: MediaQueryListEvent) => void;

/**
 * jsdom ships no `matchMedia`. This stand-in tracks its listeners so a test can
 * simulate the OS colour scheme changing under a running app.
 */
function mockMatchMedia({ matches = false, legacy = false } = {}) {
  const listeners = new Set<MediaListener>();
  let current = matches;

  const query = {
    get matches() {
      return current;
    },
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: legacy ? undefined : (_: string, fn: MediaListener) => listeners.add(fn),
    removeEventListener: legacy
      ? undefined
      : (_: string, fn: MediaListener) => listeners.delete(fn),
    addListener: (fn: MediaListener) => listeners.add(fn),
    removeListener: (fn: MediaListener) => listeners.delete(fn),
    dispatchEvent: () => true,
  };

  window.matchMedia = jest.fn().mockReturnValue(query) as unknown as typeof window.matchMedia;

  return {
    query,
    listenerCount: () => listeners.size,
    emit(next: boolean) {
      current = next;
      act(() => {
        listeners.forEach((fn) => fn({ matches: next } as MediaQueryListEvent));
      });
    },
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.className = '';
  mockMatchMedia();
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  jest.restoreAllMocks();
});

describe('theme helpers', () => {
  it('accepts only the three known themes', () => {
    expect(isTheme('light')).toBe(true);
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('system')).toBe(true);
    expect(isTheme('sepia')).toBe(false);
    expect(isTheme(null)).toBe(false);
  });

  it('resolves system against the OS preference and leaves explicit choices alone', () => {
    expect(resolveTheme('system', 'dark')).toBe('dark');
    expect(resolveTheme('system', 'light')).toBe('light');
    expect(resolveTheme('light', 'dark')).toBe('light');
    expect(resolveTheme('dark', 'light')).toBe('dark');
  });

  describe('pre-paint init script', () => {
    it('applies the stored preference before React runs', () => {
      window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');

      // eslint-disable-next-line no-eval -- exercises the script exactly as the browser would
      eval(THEME_INIT_SCRIPT);

      expect(document.documentElement).toHaveClass('dark');
    });

    it('falls back to the OS preference when nothing is stored', () => {
      mockMatchMedia({ matches: true });

      // eslint-disable-next-line no-eval -- exercises the script exactly as the browser would
      eval(THEME_INIT_SCRIPT);

      expect(document.documentElement).toHaveClass('dark');
    });

    it('ignores an unrecognised stored value', () => {
      window.localStorage.setItem(THEME_STORAGE_KEY, 'sepia');

      // eslint-disable-next-line no-eval -- exercises the script exactly as the browser would
      eval(THEME_INIT_SCRIPT);

      expect(document.documentElement).toHaveClass('light');
    });

    it('never leaves both theme classes on the element', () => {
      document.documentElement.classList.add('dark');
      window.localStorage.setItem(THEME_STORAGE_KEY, 'light');

      // eslint-disable-next-line no-eval -- exercises the script exactly as the browser would
      eval(THEME_INIT_SCRIPT);

      expect(document.documentElement).toHaveClass('light');
      expect(document.documentElement).not.toHaveClass('dark');
    });
  });
});

describe('useTheme', () => {
  it('throws a useful error outside a ThemeProvider', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => renderHook(() => useTheme())).toThrow(
      'useTheme must be used within a ThemeProvider'
    );
  });

  describe('system preference detection', () => {
    it('defaults to system and resolves to the OS preference', () => {
      mockMatchMedia({ matches: true });
      const { result } = renderHook(() => useTheme(), { wrapper });

      expect(result.current.theme).toBe('system');
      expect(result.current.systemTheme).toBe('dark');
      expect(result.current.resolvedTheme).toBe('dark');
    });

    it('resolves to light when the OS prefers light', () => {
      mockMatchMedia({ matches: false });
      const { result } = renderHook(() => useTheme(), { wrapper });

      expect(result.current.resolvedTheme).toBe('light');
    });

    it('follows the OS when it changes while set to system', () => {
      const media = mockMatchMedia({ matches: false });
      const { result } = renderHook(() => useTheme(), { wrapper });

      expect(result.current.resolvedTheme).toBe('light');

      media.emit(true);

      expect(result.current.resolvedTheme).toBe('dark');
      expect(document.documentElement).toHaveClass('dark');
    });

    it('does not follow the OS once an explicit choice has been made', () => {
      const media = mockMatchMedia({ matches: false });
      const { result } = renderHook(() => useTheme(), { wrapper });

      act(() => result.current.setTheme('light'));
      media.emit(true);

      expect(result.current.systemTheme).toBe('dark');
      expect(result.current.resolvedTheme).toBe('light');
      expect(document.documentElement).toHaveClass('light');
    });

    it('returns to following the OS when switched back to system', () => {
      const media = mockMatchMedia({ matches: true });
      const { result } = renderHook(() => useTheme(), { wrapper });

      act(() => result.current.setTheme('light'));
      expect(result.current.resolvedTheme).toBe('light');

      act(() => result.current.setTheme('system'));
      expect(result.current.resolvedTheme).toBe('dark');

      media.emit(false);
      expect(result.current.resolvedTheme).toBe('light');
    });

    it('subscribes through the legacy listener API when addEventListener is missing', () => {
      const media = mockMatchMedia({ matches: false, legacy: true });
      const { result, unmount } = renderHook(() => useTheme(), { wrapper });

      media.emit(true);
      expect(result.current.resolvedTheme).toBe('dark');

      unmount();
      expect(media.listenerCount()).toBe(0);
    });

    it('unsubscribes from the media query on unmount', () => {
      const media = mockMatchMedia({ matches: false });
      const { unmount } = renderHook(() => useTheme(), { wrapper });

      expect(media.listenerCount()).toBe(1);
      unmount();
      expect(media.listenerCount()).toBe(0);
    });

    it('falls back to light when matchMedia is unavailable', () => {
      // @ts-expect-error -- simulating an environment without matchMedia
      delete window.matchMedia;

      const { result } = renderHook(() => useTheme(), { wrapper });

      expect(result.current.resolvedTheme).toBe('light');
    });
  });

  describe('persistence', () => {
    it('adopts a stored preference on mount', () => {
      window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');

      const { result } = renderHook(() => useTheme(), { wrapper });

      expect(result.current.theme).toBe('dark');
      expect(result.current.resolvedTheme).toBe('dark');
    });

    it('ignores an unrecognised stored value', () => {
      window.localStorage.setItem(THEME_STORAGE_KEY, 'sepia');

      const { result } = renderHook(() => useTheme(), { wrapper });

      expect(result.current.theme).toBe('system');
    });

    it('persists an explicit choice', () => {
      const { result } = renderHook(() => useTheme(), { wrapper });

      act(() => result.current.setTheme('dark'));

      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    });

    it('still applies the choice when storage is unavailable', () => {
      jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      const { result } = renderHook(() => useTheme(), { wrapper });

      act(() => result.current.setTheme('dark'));

      expect(result.current.resolvedTheme).toBe('dark');
      expect(document.documentElement).toHaveClass('dark');
    });

    it('starts from system when reading storage throws', () => {
      jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });

      const { result } = renderHook(() => useTheme(), { wrapper });

      expect(result.current.theme).toBe('system');
    });
  });

  describe('applying the theme to the document', () => {
    it('puts the resolved theme class on the html element', () => {
      const { result } = renderHook(() => useTheme(), { wrapper });

      act(() => result.current.setTheme('dark'));
      expect(document.documentElement).toHaveClass('dark');
      expect(document.documentElement).not.toHaveClass('light');

      act(() => result.current.setTheme('light'));
      expect(document.documentElement).toHaveClass('light');
      expect(document.documentElement).not.toHaveClass('dark');
    });

    it('leaves unrelated classes on the html element alone', () => {
      document.documentElement.classList.add('js-enabled');

      const { result } = renderHook(() => useTheme(), { wrapper });
      act(() => result.current.setTheme('dark'));

      expect(document.documentElement).toHaveClass('js-enabled');
      expect(document.documentElement).toHaveClass('dark');
    });
  });

  describe('toggleTheme', () => {
    it('flips to the opposite of what is rendered', () => {
      mockMatchMedia({ matches: true });
      const { result } = renderHook(() => useTheme(), { wrapper });

      act(() => result.current.toggleTheme());

      expect(result.current.theme).toBe('light');
      expect(result.current.resolvedTheme).toBe('light');
    });

    it('turns a system preference into an explicit choice', () => {
      mockMatchMedia({ matches: false });
      const { result } = renderHook(() => useTheme(), { wrapper });

      expect(result.current.theme).toBe('system');

      act(() => result.current.toggleTheme());

      expect(result.current.theme).toBe('dark');
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    });

    it('round-trips back to the starting theme', () => {
      const { result } = renderHook(() => useTheme(), { wrapper });

      act(() => result.current.toggleTheme());
      act(() => result.current.toggleTheme());

      expect(result.current.resolvedTheme).toBe('light');
    });
  });

  describe('consumers', () => {
    it('re-renders every consumer when the theme changes', async () => {
      const user = userEvent.setup();

      function Consumer() {
        const { resolvedTheme, toggleTheme } = useTheme();
        return (
          <button type="button" onClick={toggleTheme}>
            {resolvedTheme}
          </button>
        );
      }

      render(
        <ThemeProvider>
          <Consumer />
          <Consumer />
        </ThemeProvider>
      );

      expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['light', 'light']);

      await user.click(screen.getAllByRole('button')[0]);

      expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['dark', 'dark']);
    });

    it('honours an explicit defaultTheme when nothing is stored', () => {
      const { result } = renderHook(() => useTheme(), {
        wrapper: ({ children }) => <ThemeProvider defaultTheme="dark">{children}</ThemeProvider>,
      });

      expect(result.current.theme).toBe('dark');
    });

    it('lets a stored preference win over defaultTheme', () => {
      window.localStorage.setItem(THEME_STORAGE_KEY, 'light');

      const { result } = renderHook(() => useTheme(), {
        wrapper: ({ children }) => <ThemeProvider defaultTheme="dark">{children}</ThemeProvider>,
      });

      expect(result.current.theme).toBe('light');
    });
  });
});
