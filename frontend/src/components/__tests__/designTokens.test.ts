import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import {
  BREAKPOINTS,
  BREAKPOINT_NAMES,
  getActiveBreakpoint,
  minWidthQuery,
} from '@/lib/breakpoints';

const APP_DIR = path.resolve(__dirname, '../../app');
const COMPONENTS_DIR = path.resolve(__dirname, '..');

const globals = readFileSync(path.join(APP_DIR, 'globals.css'), 'utf8');

/** Custom property declarations in a chunk of CSS, as `name -> value`. */
function declaredTokens(css: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const [, name, value] of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    tokens.set(name, value.trim().replace(/\s+/g, ' '));
  }
  return tokens;
}

/** The body of the rule whose selector list matches, e.g. `:root.dark`. */
function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`));
  if (!match) throw new Error(`globals.css has no rule for "${selector}"`);
  return match[1];
}

/** Custom properties consumed via `var(--x)` with no fallback value. */
function requiredTokens(css: string): string[] {
  return [...css.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)].map(([, name]) => name);
}

const tokens = declaredTokens(globals);

const SEMANTIC_COLORS = [
  '--color-primary',
  '--color-secondary',
  '--color-bg',
  '--color-surface',
  '--color-surface-raised',
  '--color-border',
  '--color-overlay',
  '--color-text',
  '--color-text-muted',
  '--color-text-inverse',
  '--color-error',
  '--color-success',
  '--color-info',
  '--color-warning',
];

describe('design tokens', () => {
  describe('token families', () => {
    it.each(['--color-', '--space-', '--radius-'])('declares %s custom properties', (prefix) => {
      const family = [...tokens.keys()].filter((name) => name.startsWith(prefix));
      expect(family.length).toBeGreaterThan(0);
    });

    it('declares the colors every component module already relies on', () => {
      for (const name of SEMANTIC_COLORS) {
        expect(tokens.has(name)).toBe(true);
      }
    });

    it('pairs every status color with a subtle variant', () => {
      for (const status of ['error', 'success', 'info', 'warning']) {
        expect(tokens.has(`--color-${status}`)).toBe(true);
        expect(tokens.has(`--color-${status}-subtle`)).toBe(true);
      }
    });
  });

  describe('spacing scale', () => {
    const spacing = [...tokens.entries()].filter(([name]) => name.startsWith('--space-'));

    it('names each step after its multiple of the 4px base', () => {
      for (const [name, value] of spacing) {
        const step = Number(name.replace('--space-', ''));
        expect(Number.isNaN(step)).toBe(false);

        const expected = step === 0 ? '0' : `${(step * 4) / 16}rem`;
        expect(value).toBe(expected);
      }
    });

    it('increases monotonically', () => {
      const rems = spacing.map(([, value]) => parseFloat(value));
      expect(rems).toEqual([...rems].sort((a, b) => a - b));
    });
  });

  describe('radius scale', () => {
    it('keeps --radius as an alias of a scale step rather than a second value', () => {
      expect(tokens.get('--radius')).toBe('var(--radius-md)');
    });

    it('increases monotonically from sm to xl', () => {
      const steps = ['--radius-sm', '--radius-md', '--radius-lg', '--radius-xl'].map((name) =>
        parseFloat(tokens.get(name) as string)
      );

      expect(steps).toEqual([...steps].sort((a, b) => a - b));
    });
  });

  describe('token integrity', () => {
    it('resolves every var() reference inside globals.css', () => {
      for (const name of requiredTokens(globals)) {
        expect(tokens.has(name)).toBe(true);
      }
    });

    it('resolves every var() reference used by component modules', () => {
      const modules = readdirSync(COMPONENTS_DIR).filter((file) => file.endsWith('.module.css'));
      expect(modules.length).toBeGreaterThan(0);

      for (const file of modules) {
        const css = readFileSync(path.join(COMPONENTS_DIR, file), 'utf8');
        for (const name of requiredTokens(css)) {
          expect({ file, name, declared: tokens.has(name) }).toEqual({
            file,
            name,
            declared: true,
          });
        }
      }
    });

    it('declares no duplicate custom properties within a single rule', () => {
      for (const [, body] of globals.matchAll(/\{([^{}]*)\}/g)) {
        const names = [...body.matchAll(/(--[\w-]+)\s*:/g)].map(([, name]) => name);
        expect(names).toHaveLength(new Set(names).size);
      }
    });

    it('keeps raw palette values out of the semantic layer', () => {
      // Components read `--color-*`; only `--palette-*` may hold literals, so a
      // new colour cannot be added to one theme and forgotten in the other.
      for (const name of SEMANTIC_COLORS) {
        expect(tokens.get(name)).toMatch(/^var\(--palette-(light|dark)-/);
      }
    });
  });

  describe('accessibility', () => {
    it('exposes a shared focus ring token', () => {
      expect(tokens.has('--color-focus-ring')).toBe(true);
      expect(tokens.has('--focus-ring-width')).toBe(true);
    });

    it('applies the focus ring through :focus-visible so keyboard users see it', () => {
      expect(globals).toMatch(/:focus-visible\s*\{[^}]*outline:[^}]*var\(--color-focus-ring\)/);
    });

    it('disables the theme transition for reduced-motion users', () => {
      expect(globals).toMatch(/@media \(prefers-reduced-motion: no-preference\)/);
    });
  });
});

describe('theme layers', () => {
  const lightRule = declaredTokens(ruleBody(globals, ':root,\n:root.light'));
  const darkRule = declaredTokens(ruleBody(globals, ':root.dark'));
  const systemDarkRule = declaredTokens(ruleBody(globals, ':root:not(.light)'));

  it('assigns every semantic color in both themes', () => {
    for (const name of SEMANTIC_COLORS) {
      expect(lightRule.get(name)).toBe(`var(--palette-light-${name.replace('--color-', '')})`);
      expect(darkRule.get(name)).toBe(`var(--palette-dark-${name.replace('--color-', '')})`);
    }
  });

  it('declares a raw palette entry behind every semantic assignment', () => {
    for (const rule of [lightRule, darkRule]) {
      for (const name of requiredTokens([...rule.values()].join(';'))) {
        expect(tokens.has(name)).toBe(true);
      }
    }
  });

  it('gives the system-preference rule the same assignments as the explicit dark class', () => {
    expect([...systemDarkRule.entries()].sort()).toEqual([...darkRule.entries()].sort());
  });

  it('sets color-scheme so native controls and scrollbars follow the theme', () => {
    expect(ruleBody(globals, ':root,\n:root.light')).toMatch(/color-scheme:\s*light;/);
    expect(ruleBody(globals, ':root.dark')).toMatch(/color-scheme:\s*dark;/);
    expect(ruleBody(globals, ':root:not(.light)')).toMatch(/color-scheme:\s*dark;/);
  });

  it('orders the explicit dark class after the media query it has to beat', () => {
    // Both selectors have the same specificity, so source order decides.
    expect(globals.indexOf(':root.dark {')).toBeGreaterThan(globals.indexOf(':root:not(.light)'));
  });

  it('flips the hover mix direction per theme so states stay visible in both', () => {
    expect(lightRule.get('--color-emphasis-mix')).toBe('black');
    expect(darkRule.get('--color-emphasis-mix')).toBe('white');
  });
});

describe('responsive breakpoints', () => {
  it('declares a token for every breakpoint, matching the TypeScript scale', () => {
    for (const name of BREAKPOINT_NAMES) {
      expect(tokens.get(`--breakpoint-${name}`)).toBe(`${BREAKPOINTS[name]}px`);
    }
  });

  it('declares breakpoints in ascending order', () => {
    const widths = BREAKPOINT_NAMES.map((name) => BREAKPOINTS[name]);
    expect(widths).toEqual([...widths].sort((a, b) => a - b));
  });

  it('gates every min-width media query on a declared breakpoint', () => {
    // A stray width here is how a responsive layout quietly stops lining up
    // with the rest of the design system.
    const widths = [...globals.matchAll(/@media \(min-width:\s*(\d+)px\)/g)].map(([, w]) =>
      Number(w)
    );

    expect(widths.length).toBeGreaterThan(0);
    for (const width of widths) {
      expect(Object.values(BREAKPOINTS)).toContain(width);
    }
  });

  it('pairs every breakpoint with a container width', () => {
    for (const name of BREAKPOINT_NAMES) {
      expect(tokens.has(`--container-max-${name}`)).toBe(true);
    }
  });

  it('keeps container widths ascending and within their breakpoint', () => {
    const maxes = BREAKPOINT_NAMES.map((name) =>
      parseFloat(tokens.get(`--container-max-${name}`) as string)
    );

    expect(maxes).toEqual([...maxes].sort((a, b) => a - b));

    BREAKPOINT_NAMES.forEach((name, index) => {
      expect(maxes[index]).toBeLessThanOrEqual(BREAKPOINTS[name]);
    });
  });

  it('ships container and grid utilities that read the tokens', () => {
    expect(globals).toMatch(/\.container\s*\{[^}]*max-width:\s*var\(--container-max\)/);
    expect(globals).toMatch(
      /\.grid\s*\{[^}]*grid-template-columns:\s*repeat\(var\(--grid-columns\)/
    );
    expect(globals).toMatch(/\.grid-auto\s*\{[^}]*auto-fill/);
  });

  it('widens the grid at each breakpoint by falling back to the step below', () => {
    for (const name of BREAKPOINT_NAMES.slice(1)) {
      expect(globals).toContain(`--grid-columns-${name}`);
    }
    expect(tokens.has('--grid-columns-base')).toBe(true);
  });

  it('names the media query a breakpoint is gated on', () => {
    expect(minWidthQuery('md')).toBe(`(min-width: ${BREAKPOINTS.md}px)`);
  });

  it('reports the widest breakpoint a viewport satisfies', () => {
    expect(getActiveBreakpoint(320)).toBeNull();
    expect(getActiveBreakpoint(BREAKPOINTS.sm - 1)).toBeNull();
    expect(getActiveBreakpoint(BREAKPOINTS.sm)).toBe('sm');
    expect(getActiveBreakpoint(800)).toBe('md');
    expect(getActiveBreakpoint(1100)).toBe('lg');
    expect(getActiveBreakpoint(1920)).toBe('xl');
  });
});
