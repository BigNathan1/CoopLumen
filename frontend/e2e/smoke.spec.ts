import { expect, test } from './support/fixtures';

test.describe('public pages', () => {
  test('the landing page introduces the product and leads into the app', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Every community');

    // The header carries a call to action as well, so the assertion is
    // scoped to the page body to pick the one in the hero.
    await page.getByRole('main').getByRole('link', { name: 'Open the app' }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('the discovery page lists the communities to join', async ({ page }) => {
    await page.goto('/communities');

    await expect(page.getByRole('heading', { name: 'Discover Communities' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3 }).first()).toBeVisible();
  });

  test('the create-community page renders the registration form', async ({ page }) => {
    await page.goto('/communities/new');

    await expect(page.getByRole('heading', { name: 'Create a community' })).toBeVisible();
    await expect(page.getByLabel('Community name')).toBeVisible();
    await expect(page.getByLabel('Issuer public key')).toBeVisible();
    await expect(page.getByLabel('Asset code')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create community' })).toBeEnabled();
  });
});
