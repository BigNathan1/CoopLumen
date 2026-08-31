/**
 * Responsive breakpoints, in pixels.
 *
 * These mirror the `--breakpoint-*` custom properties in `globals.css`. CSS
 * cannot read a custom property inside a media query condition, so the two
 * lists are kept in step by a test rather than by the language — see
 * `components/__tests__/designTokens.test.ts`.
 *
 * The scale is mobile-first: every value is a `min-width`, so the base styles
 * describe the narrowest layout and each step widens it.
 */
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

/** Breakpoints from narrowest to widest. */
export const BREAKPOINT_NAMES = Object.keys(BREAKPOINTS) as Breakpoint[];

/** The media query a breakpoint's styles are gated on. */
export function minWidthQuery(breakpoint: Breakpoint): string {
  return `(min-width: ${BREAKPOINTS[breakpoint]}px)`;
}

/**
 * The widest breakpoint the viewport currently satisfies, or `null` below the
 * narrowest one (the mobile-first base, which has no name).
 */
export function getActiveBreakpoint(width: number): Breakpoint | null {
  let active: Breakpoint | null = null;
  for (const name of BREAKPOINT_NAMES) {
    if (width >= BREAKPOINTS[name]) active = name;
  }
  return active;
}
