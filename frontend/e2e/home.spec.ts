import { expect, test } from './support/fixtures';

test.describe('Home page landing', () => {
  test('loads successfully and leads to the wallet connect button', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/CoopLumen/i);

    // The landing page links into the app, where the wallet is connected. The
    // header repeats the call to action, so the click is scoped to the hero.
    await page.getByRole('main').getByRole('link', { name: 'Open the app' }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('button', { name: 'Connect Freighter' })).toBeVisible();
  });
});
