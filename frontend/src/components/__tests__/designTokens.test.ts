import { readFileSync, readdirSync } from 'fs';
import path from 'path';

const APP_DIR = path.resolve(__dirname, '../../app');
const COMPONENTS_DIR = path.resolve(__dirname, '..');

const globals = readFileSync(path.join(APP_DIR, 'globals.css'), 'utf8');

/** The `:root` block, without the surrounding selector and braces. */
function rootBlock(css: string): string {
  const match = css.match(/:root\s*\{([\s\S]*?)\n\}/);
  if (!match) throw new Error('globals.css has no :root block');
  return match[1];
}

/** Every custom property declared in a block, as `name -> value`. */
function declaredTokens(block: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const [, name, value] of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    tokens.set(name, value.trim());
  }
  return tokens;
}

/** Custom properties consumed via `var(--x)` with no fallback value. */
function requiredTokens(css: string): string[] {
  return [...css.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)].map(([, name]) => name);
}

const tokens = declaredTokens(rootBlock(globals));

describe('design tokens', () => {
  describe('token families', () => {
    it.each(['--color-', '--space-', '--radius-'])('declares %s custom properties', (prefix) => {
      const family = [...tokens.keys()].filter((name) => name.startsWith(prefix));
      expect(family.length).toBeGreaterThan(0);
    });

    it('declares the colors every component module already relies on', () => {
      const required = [
        '--color-primary',
        '--color-secondary',
        '--color-bg',
        '--color-surface',
        '--color-border',
        '--color-text',
        '--color-text-muted',
        '--color-error',
        '--color-success',
        '--color-info',
        '--color-warning',
      ];

      for (const name of required) {
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
      const sorted = [...rems].sort((a, b) => a - b);
      expect(rems).toEqual(sorted);
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

    it('declares no duplicate custom properties', () => {
      const names = [...rootBlock(globals).matchAll(/(--[\w-]+)\s*:/g)].map(([, name]) => name);
      expect(names).toHaveLength(new Set(names).size);
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
  });
});
