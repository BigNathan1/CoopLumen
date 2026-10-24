import { createHmac } from 'node:crypto';
import { expect, test } from '@playwright/test';

const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:4000';
const SESSION_SECRET = process.env.AUTH_SESSION_SECRET ?? 'governance-e2e-secret';
const MEMBER_ADDRESS = 'GDMZRAGTOJHQK3LN3D2EDLEAMS76EDIQEMWCUTYIYHUE5HFPLPGBCGUS';

function createSessionToken(address: string): string {
  const now = Math.floor(Date.now() / 1_000);
  const body = Buffer.from(JSON.stringify({ address, iat: now, exp: now + 3_600 })).toString(
    'base64url'
  );
  const signature = createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${signature}`;
}

test.use({ viewport: { width: 375, height: 667 } });

test.describe('Responsive mobile layout (375px viewport)', () => {
  test('header collapses navigation into hamburger menu on 375px viewport', async ({ page }) => {
    await page.goto('/');

    // Desktop inline navigation links should not be present in the header bar
    const desktopNav = page.locator('header nav[aria-label="Primary"]:not(#header-mobile-menu *)');
    await expect(desktopNav).toHaveCount(0);

    // Mobile menu toggle button should be visible
    const menuButton = page.getByRole('button', { name: 'Open menu' });
    await expect(menuButton).toBeVisible();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');

    // Click menu toggle to expand mobile menu
    await menuButton.click();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('button', { name: 'Close menu' })).toBeVisible();

    // Mobile navigation container should be rendered with primary navigation links
    const mobileMenu = page.locator('#header-mobile-menu');
    await expect(mobileMenu).toBeVisible();
    await expect(mobileMenu.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(mobileMenu.getByRole('link', { name: 'Communities' })).toBeVisible();

    // Clicking close menu should collapse the menu
    await page.getByRole('button', { name: 'Close menu' }).click();
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
    await expect(page.locator('#header-mobile-menu')).not.toBeAttached();
  });

  test('landing page fits within 375px viewport without horizontal overflow', async ({ page }) => {
    await page.goto('/');

    // Ensure the page body and document root do not exceed viewport width
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // Allow sub-pixel rounding
  });

  test('communities page displays responsive cards without overflow on 375px viewport', async ({
    page,
    request,
  }) => {
    const token = createSessionToken(MEMBER_ADDRESS);
    const communityName = `Mobile E2E ${Date.now()}`;

    await request.post(`${API_URL}/api/v1/communities`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: communityName,
        description: 'Community created for mobile layout verification',
        issuerPublicKey: MEMBER_ADDRESS,
        assetCode: 'MOB',
        assetIssuer: MEMBER_ADDRESS,
      },
    });

    await page.addInitScript((sessionToken) => {
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (input, init = {}) => {
        const headers = new Headers(init.headers);
        headers.set('Authorization', `Bearer ${sessionToken}`);
        return nativeFetch(input, { ...init, headers });
      };
    }, token);

    await page.goto('/communities');

    // Verify page content loads
    await expect(page.getByRole('heading', { level: 1, name: 'Communities' })).toBeVisible();

    // Ensure no horizontal scroll blowout on mobile viewport
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
