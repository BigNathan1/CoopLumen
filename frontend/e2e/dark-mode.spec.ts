import { expect, test, type Page } from '@playwright/test';

/** Mirrors `THEME_STORAGE_KEY` in src/lib/theme.ts. */
const THEME_STORAGE_KEY = 'cooplumen-theme';

type Mode = 'light' | 'dark';

const html = (page: Page) => page.locator('html');

const hasMode = (mode: Mode) => new RegExp(`(^|\\s)${mode}(\\s|$)`);

const storedTheme = (page: Page) =>
  page.evaluate((key) => window.localStorage.getItem(key), THEME_STORAGE_KEY);

/**
 * Presses the theme toggle until the page is in `mode`.
 *
 * The toggle is server-rendered, so it is visible before React has attached
 * its click handler and an early click is silently lost. The button's label
 * names the theme it switches to, so it only exists while the page is NOT yet
 * in `mode`: the loop clicks until it disappears, and can never flip the theme
 * back by clicking twice.
 */
async function switchTo(page: Page, mode: Mode) {
  const toggle = page.getByRole('button', { name: `Switch to ${mode} theme` });
  await expect(async () => {
    if (await toggle.isVisible()) {
      await toggle.click();
    }
    await expect(html(page)).toHaveClass(hasMode(mode), { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

test.describe('dark mode', () => {
  test.use({ colorScheme: 'light' });

  test('the choice survives client-side navigation, history, reloads and new tabs', async ({
    page,
    context,
  }) => {
    await page.goto('/communities');
    await expect(html(page)).toHaveClass(hasMode('light'));
    expect(await storedTheme(page)).toBeNull();

    await switchTo(page, 'dark');
    await expect(page.getByRole('button', { name: 'Switch to light theme' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(await storedTheme(page)).toBe('dark');

    // Client-side navigation: the marker lives on `window`, so it only survives
    // if the app router swapped the page without a full document load.
    await page.evaluate(() => {
      (window as unknown as { __clientNav: boolean }).__clientNav = true;
    });
    await page.getByRole('banner').getByRole('link', { name: 'CoopLumen' }).click();
    await expect(page).toHaveURL(/\/$/);
    expect(
      await page.evaluate(() => (window as unknown as { __clientNav?: boolean }).__clientNav)
    ).toBe(true);
    await expect(html(page)).toHaveClass(hasMode('dark'));
    await expect(page.getByRole('button', { name: 'Switch to light theme' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    // Back to the first page through history.
    await page.goBack();
    await expect(page).toHaveURL(/\/communities$/);
    await expect(html(page)).toHaveClass(hasMode('dark'));

    // A full reload re-reads the stored preference. `domcontentloaded` fires
    // before React hydrates, so this also covers the pre-paint script that
    // prevents a flash of the light palette.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(html(page)).toHaveClass(hasMode('dark'));
    await expect(page.getByRole('button', { name: 'Switch to light theme' })).toBeVisible();

    // A fresh tab in the same browser profile starts out dark.
    const secondTab = await context.newPage();
    await secondTab.goto('/');
    await expect(html(secondTab)).toHaveClass(hasMode('dark'));
    await secondTab.close();

    // Switching back is remembered too, and replaces the dark choice.
    await switchTo(page, 'light');
    expect(await storedTheme(page)).toBe('light');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(html(page)).toHaveClass(hasMode('light'));
    await expect(html(page)).not.toHaveClass(hasMode('dark'));
  });
});

test.describe('dark mode with a dark operating system preference', () => {
  test.use({ colorScheme: 'dark' });

  test('an explicit light choice beats the operating system and persists', async ({ page }) => {
    // No stored choice yet, so the page follows the operating system.
    await page.goto('/communities');
    await expect(html(page)).toHaveClass(hasMode('dark'));

    await switchTo(page, 'light');
    expect(await storedTheme(page)).toBe('light');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(html(page)).toHaveClass(hasMode('light'));
    await expect(html(page)).not.toHaveClass(hasMode('dark'));
  });
});
