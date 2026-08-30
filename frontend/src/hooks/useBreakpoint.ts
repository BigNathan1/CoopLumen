'use client';

import { useEffect, useState } from 'react';
import { BREAKPOINTS, BREAKPOINT_NAMES, minWidthQuery, type Breakpoint } from '@/lib/breakpoints';

/**
 * Subscribes to a media query.
 *
 * Returns `false` on the server and on the first client render, because the
 * viewport is unknown until the component is mounted. Seeding it from
 * `matchMedia` instead would make the hydrated markup disagree with the
 * server's, so layout that must be correct without JavaScript belongs in a CSS
 * media query, not here.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;

    const list = window.matchMedia(query);
    setMatches(list.matches);

    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);

    // Safari below 14 only implements the deprecated listener API.
    if (typeof list.addEventListener === 'function') {
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    }

    list.addListener(onChange);
    return () => list.removeListener(onChange);
  }, [query]);

  return matches;
}

/** Whether the viewport is at least as wide as the given breakpoint. */
export function useMinWidth(breakpoint: Breakpoint): boolean {
  return useMediaQuery(minWidthQuery(breakpoint));
}

/**
 * The widest breakpoint the viewport currently satisfies, or `null` below the
 * narrowest one. Use it for behaviour that genuinely differs by size — swapping
 * a component out, say. Prefer plain CSS for anything that is only styling.
 */
export function useBreakpoint(): Breakpoint | null {
  const [active, setActive] = useState<Breakpoint | null>(null);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;

    const lists = BREAKPOINT_NAMES.map(
      (name) => [name, window.matchMedia(minWidthQuery(name))] as const
    );

    const update = () => {
      let widest: Breakpoint | null = null;
      for (const [name, list] of lists) {
        if (list.matches) widest = name;
      }
      setActive(widest);
    };

    update();

    const cleanups = lists.map(([, list]) => {
      if (typeof list.addEventListener === 'function') {
        list.addEventListener('change', update);
        return () => list.removeEventListener('change', update);
      }

      list.addListener(update);
      return () => list.removeListener(update);
    });

    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  return active;
}

export { BREAKPOINTS, type Breakpoint };
