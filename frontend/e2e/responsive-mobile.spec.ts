import { createCommunity } from './support/api';
import { expect, test } from './support/fixtures';

test.use({ viewport: { width: 375, height: 667 } });

test.describe('Responsive mobile layout (375px viewport)', () => {
  test('header collapses navigation into hamburger menu on 375px viewport', async ({ page }) => {
    // The app header (not the landing page's) owns the collapsible menu.
    await page.goto('/communities');

    // At this width the inline navigation is replaced by the menu.
    const desktopNav = page.locator('header nav[aria-label="Primary"]:not(#header-mobile-menu *)');
    await expect(desktopNav).toHaveCount(0);

    // The toggle's accessible name flips between "Open menu" and "Close menu",
    // so it is located by the menu it controls.
    const menuButton = page.locator('button[aria-controls="header-mobile-menu"]');
    await expect(menuButton).toBeVisible();
    await expect(menuButton).toHaveAccessibleName('Open menu');
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');

    await menuButton.click();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    await expect(menuButton).toHaveAccessibleName('Close menu');

    const mobileMenu = page.locator('#header-mobile-menu');
    await expect(mobileMenu).toBeVisible();
    await expect(mobileMenu.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(mobileMenu.getByRole('link', { name: 'Communities' })).toBeVisible();

    await menuButton.click();
    await expect(menuButton).toHaveAccessibleName('Open menu');
    await expect(mobileMenu).not.toBeAttached();
  });

  test('landing page fits within 375px viewport without horizontal overflow', async ({ page }) => {
    await page.goto('/');

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // Allow sub-pixel rounding
  });

  test('communities page displays responsive cards without overflow on 375px viewport', async ({
    authenticatedPage: page,
    request,
    apiUrl,
    memberAddress,
    sessionToken,
  }) => {
    await createCommunity(request, apiUrl, sessionToken, {
      name: `Mobile E2E ${Date.now()}`,
      description: 'Community created for mobile layout verification',
      issuerPublicKey: memberAddress,
      assetCode: 'MOB',
      assetIssuer: memberAddress,
    });

    await page.goto('/communities');

    await expect(page.getByRole('heading', { level: 1, name: 'Communities' })).toBeVisible();

    // No horizontal scroll at this width.
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
