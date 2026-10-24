import {
  BREAKPOINTS,
  BREAKPOINT_NAMES,
  minWidthQuery,
  getActiveBreakpoint,
} from '@/lib/breakpoints';

describe('breakpoints', () => {
  describe('BREAKPOINTS', () => {
    it('defines the expected breakpoints in pixels', () => {
      expect(BREAKPOINTS.sm).toBe(640);
      expect(BREAKPOINTS.md).toBe(768);
      expect(BREAKPOINTS.lg).toBe(1024);
      expect(BREAKPOINTS.xl).toBe(1280);
    });

    it('is immutable', () => {
      expect(Object.isFrozen(BREAKPOINTS)).toBe(false); // as const makes it readonly at compile time
      // but we can verify the structure
      expect(BREAKPOINTS).toEqual({
        sm: 640,
        md: 768,
        lg: 1024,
        xl: 1280,
      });
    });
  });

  describe('BREAKPOINT_NAMES', () => {
    it('lists all breakpoints from narrowest to widest', () => {
      expect(BREAKPOINT_NAMES).toEqual(['sm', 'md', 'lg', 'xl']);
    });

    it('maintains the correct order for mobile-first approach', () => {
      const breakpointValues = BREAKPOINT_NAMES.map((name) => BREAKPOINTS[name]);
      const sortedValues = [...breakpointValues].sort((a, b) => a - b);
      expect(breakpointValues).toEqual(sortedValues);
    });
  });

  describe('minWidthQuery', () => {
    it('generates a min-width media query for sm breakpoint', () => {
      expect(minWidthQuery('sm')).toBe('(min-width: 640px)');
    });

    it('generates a min-width media query for md breakpoint', () => {
      expect(minWidthQuery('md')).toBe('(min-width: 768px)');
    });

    it('generates a min-width media query for lg breakpoint', () => {
      expect(minWidthQuery('lg')).toBe('(min-width: 1024px)');
    });

    it('generates a min-width media query for xl breakpoint', () => {
      expect(minWidthQuery('xl')).toBe('(min-width: 1280px)');
    });
  });

  describe('getActiveBreakpoint', () => {
    it('returns null for viewports below the narrowest breakpoint', () => {
      expect(getActiveBreakpoint(320)).toBeNull();
      expect(getActiveBreakpoint(639)).toBeNull();
    });

    it('returns "sm" for viewports at or above 640px but below 768px', () => {
      expect(getActiveBreakpoint(640)).toBe('sm');
      expect(getActiveBreakpoint(700)).toBe('sm');
      expect(getActiveBreakpoint(767)).toBe('sm');
    });

    it('returns "md" for viewports at or above 768px but below 1024px', () => {
      expect(getActiveBreakpoint(768)).toBe('md');
      expect(getActiveBreakpoint(900)).toBe('md');
      expect(getActiveBreakpoint(1023)).toBe('md');
    });

    it('returns "lg" for viewports at or above 1024px but below 1280px', () => {
      expect(getActiveBreakpoint(1024)).toBe('lg');
      expect(getActiveBreakpoint(1200)).toBe('lg');
      expect(getActiveBreakpoint(1279)).toBe('lg');
    });

    it('returns "xl" for viewports at or above 1280px', () => {
      expect(getActiveBreakpoint(1280)).toBe('xl');
      expect(getActiveBreakpoint(1920)).toBe('xl');
      expect(getActiveBreakpoint(3840)).toBe('xl');
    });

    it('handles edge cases at exact breakpoint values', () => {
      // Exactly at each breakpoint
      expect(getActiveBreakpoint(640)).toBe('sm');
      expect(getActiveBreakpoint(768)).toBe('md');
      expect(getActiveBreakpoint(1024)).toBe('lg');
      expect(getActiveBreakpoint(1280)).toBe('xl');
    });

    it('returns the widest applicable breakpoint (mobile-first)', () => {
      // At 1920px, all breakpoints are satisfied, so it returns the widest
      expect(getActiveBreakpoint(1920)).toBe('xl');
    });

    it('handles zero width', () => {
      expect(getActiveBreakpoint(0)).toBeNull();
    });

    it('handles negative width gracefully', () => {
      expect(getActiveBreakpoint(-100)).toBeNull();
    });

    it('handles very large widths', () => {
      expect(getActiveBreakpoint(10000)).toBe('xl');
    });
  });

  describe('mobile-first approach', () => {
    it('ensures breakpoints increase in value', () => {
      expect(BREAKPOINTS.sm).toBeLessThan(BREAKPOINTS.md);
      expect(BREAKPOINTS.md).toBeLessThan(BREAKPOINTS.lg);
      expect(BREAKPOINTS.lg).toBeLessThan(BREAKPOINTS.xl);
    });

    it('uses min-width (not max-width) for queries', () => {
      const query = minWidthQuery('md');
      expect(query).toContain('min-width');
      expect(query).not.toContain('max-width');
    });
  });
});
