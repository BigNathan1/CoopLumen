import { act, renderHook } from '@testing-library/react';
import { useBreakpoint, useMediaQuery, useMinWidth } from '../useBreakpoint';
import { BREAKPOINTS, minWidthQuery } from '@/lib/breakpoints';

type MediaListener = (event: MediaQueryListEvent) => void;

/**
 * jsdom has no layout, so `matchMedia` is stubbed with a viewport width the
 * test controls. Every `(min-width: Npx)` query is answered against it, which
 * lets a single `resize` drive several queries at once — exactly what
 * `useBreakpoint` subscribes to.
 */
function mockViewport(initialWidth: number, { legacy = false } = {}) {
  const registry = new Map<string, { matches: boolean; listeners: Set<MediaListener> }>();
  let width = initialWidth;

  const evaluate = (query: string) => {
    const match = query.match(/min-width:\s*(\d+)px/);
    return match ? width >= Number(match[1]) : false;
  };

  window.matchMedia = jest.fn((query: string) => {
    const entry = registry.get(query) ?? { matches: evaluate(query), listeners: new Set() };
    entry.matches = evaluate(query);
    registry.set(query, entry);

    return {
      get matches() {
        return entry.matches;
      },
      media: query,
      onchange: null,
      addEventListener: legacy
        ? undefined
        : (_: string, fn: MediaListener) => entry.listeners.add(fn),
      removeEventListener: legacy
        ? undefined
        : (_: string, fn: MediaListener) => entry.listeners.delete(fn),
      addListener: (fn: MediaListener) => entry.listeners.add(fn),
      removeListener: (fn: MediaListener) => entry.listeners.delete(fn),
      dispatchEvent: () => true,
    };
  }) as unknown as typeof window.matchMedia;

  return {
    listenerCount: () =>
      [...registry.values()].reduce((total, entry) => total + entry.listeners.size, 0),
    resize(next: number) {
      width = next;
      act(() => {
        for (const [query, entry] of registry) {
          const matches = evaluate(query);
          if (matches === entry.matches) continue;
          entry.matches = matches;
          entry.listeners.forEach((fn) => fn({ matches } as MediaQueryListEvent));
        }
      });
    },
  };
}

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  jest.restoreAllMocks();
});

describe('useMediaQuery', () => {
  it('reports whether the query matches after mount', () => {
    mockViewport(1000);

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));

    expect(result.current).toBe(true);
  });

  it('reports false when the query does not match', () => {
    mockViewport(500);

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));

    expect(result.current).toBe(false);
  });

  it('updates when the query starts matching', () => {
    const viewport = mockViewport(500);
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));

    expect(result.current).toBe(false);

    viewport.resize(900);

    expect(result.current).toBe(true);
  });

  it('resubscribes when the query changes', () => {
    const viewport = mockViewport(800);
    const { result, rerender } = renderHook(({ query }) => useMediaQuery(query), {
      initialProps: { query: '(min-width: 768px)' },
    });

    expect(result.current).toBe(true);

    rerender({ query: '(min-width: 1280px)' });

    expect(result.current).toBe(false);
    expect(viewport.listenerCount()).toBe(1);
  });

  it('unsubscribes on unmount', () => {
    const viewport = mockViewport(800);
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'));

    expect(viewport.listenerCount()).toBe(1);
    unmount();
    expect(viewport.listenerCount()).toBe(0);
  });

  it('uses the legacy listener API when addEventListener is missing', () => {
    const viewport = mockViewport(500, { legacy: true });
    const { result, unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'));

    viewport.resize(900);
    expect(result.current).toBe(true);

    unmount();
    expect(viewport.listenerCount()).toBe(0);
  });

  it('stays false when matchMedia is unavailable', () => {
    // @ts-expect-error -- simulating an environment without matchMedia
    delete window.matchMedia;

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));

    expect(result.current).toBe(false);
  });
});

describe('useMinWidth', () => {
  it('matches at exactly the breakpoint width', () => {
    mockViewport(BREAKPOINTS.md);

    const { result } = renderHook(() => useMinWidth('md'));

    expect(result.current).toBe(true);
  });

  it('does not match one pixel below the breakpoint', () => {
    mockViewport(BREAKPOINTS.md - 1);

    const { result } = renderHook(() => useMinWidth('md'));

    expect(result.current).toBe(false);
  });

  it('queries the width declared for the breakpoint', () => {
    mockViewport(1000);
    renderHook(() => useMinWidth('lg'));

    expect(window.matchMedia).toHaveBeenCalledWith(minWidthQuery('lg'));
  });
});

describe('useBreakpoint', () => {
  it('returns null below the narrowest breakpoint', () => {
    mockViewport(320);

    const { result } = renderHook(() => useBreakpoint());

    expect(result.current).toBeNull();
  });

  it.each([
    [BREAKPOINTS.sm, 'sm'],
    [BREAKPOINTS.md, 'md'],
    [BREAKPOINTS.lg, 'lg'],
    [BREAKPOINTS.xl, 'xl'],
  ])('returns the widest breakpoint satisfied at %ipx', (width, expected) => {
    mockViewport(width);

    const { result } = renderHook(() => useBreakpoint());

    expect(result.current).toBe(expected);
  });

  it('follows the viewport as it widens and narrows', () => {
    const viewport = mockViewport(320);
    const { result } = renderHook(() => useBreakpoint());

    expect(result.current).toBeNull();

    viewport.resize(700);
    expect(result.current).toBe('sm');

    viewport.resize(1500);
    expect(result.current).toBe('xl');

    viewport.resize(500);
    expect(result.current).toBeNull();
  });

  it('subscribes once per breakpoint and cleans every subscription up', () => {
    const viewport = mockViewport(1000);
    const { unmount } = renderHook(() => useBreakpoint());

    expect(viewport.listenerCount()).toBe(Object.keys(BREAKPOINTS).length);

    unmount();
    expect(viewport.listenerCount()).toBe(0);
  });

  it('returns null when matchMedia is unavailable', () => {
    // @ts-expect-error -- simulating an environment without matchMedia
    delete window.matchMedia;

    const { result } = renderHook(() => useBreakpoint());

    expect(result.current).toBeNull();
  });
});
